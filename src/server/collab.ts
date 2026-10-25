import { mkdir, readFile, writeFile } from 'node:fs/promises'

import { Server } from '@hocuspocus/server'
import { prosemirrorJSONToYDoc, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import * as Y from 'yjs'

import { CONTENT_FIELD, markdown, schema } from '../shared/editor'
import { constantTimeEquals, readCookie, SESSION_COOKIE, verifySession } from './auth'
import type { Config } from './config'
import {
  hashOf,
  isValidSlug,
  normalizeMarkdown,
  readDocument,
  sidecarPathFor,
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

    async onAuthenticate({ request, token, documentName }) {
      if (!isValidSlug(documentName)) throw new Error('unauthorized')
      const cookie = readCookie(request.headers.get('cookie') ?? undefined, SESSION_COOKIE)
      if (verifySession(config.secret, cookie)) return { user: 'owner' }
      if (token && constantTimeEquals(token, config.token)) return { user: 'token' }
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
        Y.applyUpdate(document, Y.encodeStateAsUpdate(yDocFromMarkdown(body)))
        lastWritten.set(documentName, hashOf(normalizeMarkdown(body)))
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
