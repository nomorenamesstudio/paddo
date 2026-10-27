import { mkdir, readFile, writeFile } from 'node:fs/promises'

import { Server } from '@hocuspocus/server'
import { prosemirrorJSONToYDoc, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import * as Y from 'yjs'

import { CONTENT_FIELD, markdown, schema } from '../shared/editor'
import { constantTimeEquals, readCookie, SESSION_COOKIE, verifySession } from './auth'
import { allows, verifyToken } from './tokens'
import type { Config } from './config'
import {
  freeSlug,
  hashOf,
  isValidSlug,
  normalizeMarkdown,
  readDocument,
  renameDocument,
  sidecarPathFor,
  titleOf,
  writeDocument,
} from './documents'

/**
 * One HTTP port: Fastify owns the socket and forwards upgrade requests here.
 * Nothing in this module listens on its own.
 */
export function createCollab(config: Config) {
  /**
   * The markdown this process last wrote (or loaded) per document. Used twice:
   * to recognise our own file-watch echo, and to refuse to overwrite a file that
   * something else edited while we were not looking.
   */
  const lastWritten = new Map<string, string>()

  const server = new Server({
    debounce: 700,
    maxDebounce: 3000,

    async onAuthenticate({ request, token, documentName, requestParameters }) {
      if (!isValidSlug(documentName)) throw new Error('unauthorized')
      const cookie = readCookie(request.headers.get('cookie') ?? undefined, SESSION_COOKIE)
      if (verifySession(config.secret, cookie)) return { user: 'owner' }

      // A machine client cannot send a cookie, and its token may ride either the
      // upgrade query string or the protocol's auth message.
      const queryToken = requestParameters.get('token')
      const offered = token ?? queryToken ?? ''
      if (offered && constantTimeEquals(offered, config.token)) return { user: 'token' }

      // A minted token with read access to this document may join the room; the
      // scope is checked here, against the room it actually asks for.
      if (offered) {
        const minted = await verifyToken(config, offered)
        if (minted && allows(minted, 'read', documentName)) {
          return { user: 'token', token: minted.id }
        }
      }

      throw new Error('unauthorized')
    },

    async onLoadDocument({ document, documentName }) {
      const fragment = document.getXmlFragment(CONTENT_FIELD)
      if (fragment.length > 0) return

      // The sidecar keeps CRDT identity (and therefore every stored anchor) across
      // restarts. The markdown is the canonical prose but cannot rebuild anchors.
      try {
        const sidecar = await readFile(sidecarPathFor(config, documentName))
        Y.applyUpdate(document, new Uint8Array(sidecar))
        if (fragment.length > 0) {
          // Remember what the file on disk holds for this state, so the first
          // store does not rewrite it and a foreign edit is still detectable.
          lastWritten.set(documentName, hashOf(markdownFromYDoc(document)))
          return
        }
      } catch {
        // No sidecar: fall back to the markdown.
      }

      try {
        const body = await readDocument(config, documentName)
        if (seedDocumentFromMarkdown(document, body)) {
          lastWritten.set(documentName, hashOf(normalizeMarkdown(body)))
        }
      } catch {
        // A room for a document that does not exist yet: it starts empty.
      }
    },

    async onStoreDocument({ document, documentName }) {
      const body = markdownFromYDoc(document)
      const hash = hashOf(body)
      const previous = lastWritten.get(documentName)

      if (previous === hash) {
        // Nothing changed in the CRDT: leave the file's mtime alone.
        await writeSidecar(config, documentName, document)
        return
      }

      // Someone edited the file directly. Their text stays until it is reviewed:
      // the editor's state is safe in the sidecar, and the watcher turns their
      // change into suggestions instead of it being silently overwritten here.
      try {
        const diskHash = hashOf(normalizeMarkdown(await readDocument(config, documentName)))
        if (previous !== undefined && diskHash !== previous) {
          await writeSidecar(config, documentName, document)
          return
        }
      } catch {
        // No file yet: writing it is the right move.
      }

      await writeDocument(config, documentName, body)
      lastWritten.set(documentName, hash)
      await writeSidecar(config, documentName, document)
    },

    /**
     * The last store before a room unloads is the safe moment to rename: no client
     * is attached to the old name any more, so the file can simply become the title.
     */
    async afterUnloadDocument({ documentName }) {
      if (!isValidSlug(documentName)) return
      try {
        const body = await readDocument(config, documentName)
        const wanted = await freeSlug(config, titleOf(body, documentName), documentName)
        if (wanted === documentName || !isValidSlug(wanted)) return
        await renameDocument(config, documentName, wanted)
        lastWritten.delete(documentName)
        console.log(`renamed ${documentName} → ${wanted}`)
      } catch {
        // No file (deleted while open) or an unusable title: leave the name alone.
      }
    },
  })

  return { server, lastWritten }
}

async function writeSidecar(config: Config, slug: string, document: Y.Doc): Promise<void> {
  await mkdir(config.sidecarDir, { recursive: true })
  await writeFile(sidecarPathFor(config, slug), Y.encodeStateAsUpdate(document))
}

export function markdownFromYDoc(doc: Y.Doc): string {
  const node = yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment(CONTENT_FIELD), schema)
  return normalizeMarkdown(markdown.serialize(node.toJSON()))
}

export function yDocFromMarkdown(body: string): Y.Doc {
  const json = markdown.parse(body)
  return prosemirrorJSONToYDoc(schema, json, CONTENT_FIELD)
}

/**
 * Seeds an empty room from markdown. Each seed comes from a fresh Y.Doc with its
 * own client id, so applying one twice appends a second copy of the whole
 * document instead of merging into the first. The emptiness check therefore has
 * to happen inside the transaction that applies the seed.
 */
const textOf = (node: { toString(): string }): string => node.toString().replace(/<[^>]*>/g, '').trim()

/**
 * A document is empty when it holds nothing but placeholder blocks. A connected
 * editor always keeps at least one paragraph — an empty ProseMirror document is
 * invalid — so counting blocks is not the same as counting content.
 */
export function isEmptyDocument(fragment: Y.XmlFragment): boolean {
  return !fragment.toArray().some((node) => textOf(node) !== '')
}

export function seedDocumentFromMarkdown(document: Y.Doc, body: string): boolean {
  const fragment = document.getXmlFragment(CONTENT_FIELD)
  if (!isEmptyDocument(fragment)) return false

  const seed = Y.encodeStateAsUpdate(yDocFromMarkdown(body))
  let applied = false
  document.transact(() => {
    if (!isEmptyDocument(fragment)) return
    // Drop the placeholders in the same transaction as the seed, so a connected
    // editor cannot re-add one in between.
    for (let index = fragment.length - 1; index >= 0; index -= 1) {
      const node = fragment.get(index)
      if (node && textOf(node) === '') fragment.delete(index, 1)
    }
    Y.applyUpdate(document, seed)
    applied = true
  })
  return applied
}
