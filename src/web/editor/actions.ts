import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { relativePositionToAbsolutePosition } from 'y-prosemirror'
import * as Y from 'yjs'

import { SUGGESTIONS_MAP, type Suggestion } from '../../shared/suggestions'

export interface SuggestionRange {
  suggestion: Suggestion
  from: number
  to: number
}

interface SyncState {
  doc: Y.Doc
  type: Y.XmlFragment
  binding: { mapping: Parameters<typeof relativePositionToAbsolutePosition>[3] }
}

/**
 * Tiptap's Collaboration extension installs y-prosemirror's sync plugin, but
 * PluginKey identity depends on a single module instance surviving bundling, and
 * it does not: the key object in the editor is not the one this file imports.
 * The plugin's own string key is stable, so find the plugin, then ask it.
 */
function syncPluginOf(editor: Editor) {
  return editor.state.plugins.find((plugin) => {
    const candidate = plugin as unknown as {
      key?: { key?: string }
      spec?: { key?: { key?: string } }
    }
    return (candidate.key?.key ?? candidate.spec?.key?.key) === 'y-sync$'
  })
}

function syncStateOf(editor: Editor): SyncState | undefined {
  const plugin = syncPluginOf(editor)
  if (!plugin) return undefined
  return plugin.getState(editor.state) as SyncState | undefined
}

function decode(doc: Y.Doc, type: Y.XmlFragment, encoded: Uint8Array, sync: SyncState) {
  try {
    return relativePositionToAbsolutePosition(
      doc,
      type,
      Y.decodeRelativePosition(encoded),
      sync.binding.mapping,
    )
  } catch {
    // A mapping the binding has not caught up with: treat it as unanchored
    // rather than taking the editor down.
    return null
  }
}

/** Temporary: explains why a suggestion did or did not resolve. */
export function diagnoseSuggestions(editor: Editor) {
  const pluginKeys = editor.state.plugins.map((plugin) => {
    const key = (plugin as unknown as { key?: { key?: string } }).key
    const specKey = (plugin as unknown as { spec?: { key?: { key?: string } } }).spec?.key
    return key?.key ?? specKey?.key ?? '(none)'
  })
  const sync = syncStateOf(editor)
  if (!sync) return { error: 'no collaboration plugin state', pluginKeys }
  const map = sync.doc.getMap<Record<string, unknown>>(SUGGESTIONS_MAP)
  const mapping = sync.binding.mapping as unknown as { map?: Map<unknown, unknown> }

  const rows = []
  for (const value of map.values()) {
    const suggestion = value as unknown as Suggestion
    const row: Record<string, unknown> = { id: suggestion.id, status: suggestion.status }
    try {
      row.from = relativePositionToAbsolutePosition(
        sync.doc,
        sync.type,
        Y.decodeRelativePosition(suggestion.from),
        sync.binding.mapping,
      )
    } catch (error) {
      row.fromError = String(error)
    }
    if (suggestion.to) {
      try {
        row.to = relativePositionToAbsolutePosition(
          sync.doc,
          sync.type,
          Y.decodeRelativePosition(suggestion.to),
          sync.binding.mapping,
        )
      } catch (error) {
        row.toError = String(error)
      }
    }
    rows.push(row)
  }

  return {
    mappingSize: mapping.map?.size ?? null,
    typeLength: sync.type.length,
    docTextLength: editor.state.doc.content.size,
    rows,
    pending: pendingRanges(editor).length,
  }
}

/** Pending suggestions with their resolved document ranges, sorted by position. */
export function pendingRanges(editor: Editor): SuggestionRange[] {
  const sync = syncStateOf(editor)
  if (!sync) return []

  const map = sync.doc.getMap<Record<string, unknown>>(SUGGESTIONS_MAP)
  const ranges: SuggestionRange[] = []

  for (const value of map.values()) {
    const suggestion = value as unknown as Suggestion
    if (suggestion.status !== 'pending') continue
    const from = decode(sync.doc, sync.type, suggestion.from, sync)
    const to = suggestion.to ? decode(sync.doc, sync.type, suggestion.to, sync) : from
    if (from == null || to == null || to < from) continue
    ranges.push({ suggestion, from, to })
  }

  return ranges.sort((a, b) => a.from - b.from)
}

/** The document's text with the position of every character, for re-anchoring. */
export function textIndex(doc: PMNode): { text: string; positions: number[] } {
  const chars: string[] = []
  const positions: number[] = []
  let seenBlock = false

  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      // ProseMirror positions advance by one per character, starting at `pos`.
      for (let index = 0; index < node.text.length; index += 1) {
        chars.push(node.text[index] as string)
        positions.push(pos + index)
      }
      return true
    }

    if (node.isBlock) {
      if (seenBlock) {
        chars.push('\n')
        positions.push(pos)
      }
      seenBlock = true
    }

    return true
  })

  return { text: chars.join(''), positions }
}

export function relocate(doc: PMNode, quote: string): { from: number; to: number } | null {
  if (!quote) return null
  const { text, positions } = textIndex(doc)
  const at = text.indexOf(quote)
  if (at === -1) return null
  if (text.indexOf(quote, at + 1) !== -1) return null

  const from = positions[at]
  const last = positions[at + quote.length - 1]
  if (from == null || last == null) return null
  return { from, to: last + 1 }
}

function paragraphType(editor: Editor) {
  const paragraph = editor.schema.nodes.paragraph
  if (!paragraph) throw new Error('the schema has no paragraph node')
  return paragraph
}

function replaceRange(editor: Editor, from: number, to: number, proposed: string) {
  const { tr } = editor.state
  const blocks = proposed.split(/\n{2,}/).map((block) => block.replace(/\n/g, ' '))

  if (blocks.length <= 1) {
    const text = blocks[0] ?? ''
    if (text === '') tr.delete(from, to)
    else tr.replaceWith(from, to, editor.schema.text(text))
    return { tr, end: from + text.length }
  }

  const paragraph = paragraphType(editor)
  const nodes = blocks.map((block) =>
    paragraph.create(null, block ? editor.schema.text(block) : undefined),
  )
  tr.replaceWith(from, to, nodes)
  return { tr, end: from + nodes.reduce((total, node) => total + node.nodeSize, 0) }
}

export type AcceptResult = 'applied' | 'stale'

export function acceptSuggestion(
  editor: Editor,
  id: string,
  options: { select?: boolean } = {},
): AcceptResult {
  const sync = syncStateOf(editor)
  if (!sync) return 'stale'

  const map = sync.doc.getMap<Record<string, unknown>>(SUGGESTIONS_MAP)
  const suggestion = map.get(id) as unknown as Suggestion | undefined
  if (!suggestion) return 'stale'

  const resolved = pendingRanges(editor).find((range) => range.suggestion.id === id)
  let range = resolved ? { from: resolved.from, to: resolved.to } : null

  // The text may have moved or changed since the agent proposed it.
  const currentText = range ? editor.state.doc.textBetween(range.from, range.to, '', '') : null
  if (!range || currentText !== suggestion.original) {
    const relocated = relocate(editor.state.doc, suggestion.original)
    if (!relocated) return 'stale'
    range = relocated
  }

  const { tr, end } = replaceRange(editor, range.from, range.to, suggestion.proposed)

  if (options.select && suggestion.proposed.length > 0) {
    const clampedEnd = Math.min(end, tr.doc.content.size)
    if (clampedEnd > range.from) {
      tr.setSelection(TextSelection.create(tr.doc, range.from, clampedEnd))
    }
  }

  editor.view.dispatch(tr)
  map.delete(id)
  return 'applied'
}

/**
 * A hunk whose quoted text is gone from the document can never be applied; it is
 * not a suggestion any more, just a ghost the reader cannot dismiss. Called once
 * the room is synced, so a half-loaded document is never mistaken for a dead one.
 */
export function pruneDeadSuggestions(editor: Editor): number {
  const sync = syncStateOf(editor)
  if (!sync) return 0

  const { text } = textIndex(editor.state.doc)
  const map = sync.doc.getMap<Record<string, unknown>>(SUGGESTIONS_MAP)
  const dead: string[] = []

  for (const value of map.values()) {
    const suggestion = value as unknown as Suggestion
    if (suggestion.status !== 'pending') continue
    const original = (suggestion.original ?? '').trim()
    if (original === '') continue
    if (!text.includes(original)) dead.push(suggestion.id)
  }

  for (const id of dead) map.delete(id)
  return dead.length
}

export function rejectSuggestion(editor: Editor, id: string): void {
  const sync = syncStateOf(editor)
  if (!sync) return
  sync.doc.getMap<Record<string, unknown>>(SUGGESTIONS_MAP).delete(id)
}

/** All pending hunks as a single transaction, so one undo takes them all back. */
export function acceptAllSuggestions(editor: Editor): number {
  const ranges = [...pendingRanges(editor)].sort((a, b) => b.from - a.from)
  if (ranges.length === 0) return 0

  const sync = syncStateOf(editor)
  if (!sync) return 0
  const map = sync.doc.getMap<Record<string, unknown>>(SUGGESTIONS_MAP)

  const { tr } = editor.state
  const applied: string[] = []

  for (const { suggestion, from, to } of ranges) {
    const currentText = editor.state.doc.textBetween(from, to, '', '')
    if (currentText !== suggestion.original) continue

    const blocks = suggestion.proposed.split(/\n{2,}/).map((block) => block.replace(/\n/g, ' '))
    if (blocks.length <= 1) {
      const text = blocks[0] ?? ''
      if (text === '') tr.delete(from, to)
      else tr.replaceWith(from, to, editor.schema.text(text))
    } else {
      const paragraph = paragraphType(editor)
      const nodes = blocks.map((block) =>
        paragraph.create(null, block ? editor.schema.text(block) : undefined),
      )
      tr.replaceWith(from, to, nodes)
    }
    applied.push(suggestion.id)
  }

  if (applied.length === 0) return 0

  editor.view.dispatch(tr)
  for (const id of applied) map.delete(id)
  return applied.length
}

export function rejectAllSuggestions(editor: Editor): number {
  const sync = syncStateOf(editor)
  if (!sync) return 0
  const map = sync.doc.getMap<Record<string, unknown>>(SUGGESTIONS_MAP)
  const ids = [...map.values()]
    .map((value) => value as unknown as Suggestion)
    .filter((suggestion) => suggestion.status === 'pending')
    .map((suggestion) => suggestion.id)
  for (const id of ids) map.delete(id)
  return ids.length
}
