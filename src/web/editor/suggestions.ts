import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import * as Y from 'yjs'

import { isLargeSuggestion, SUGGESTIONS_MAP, type Suggestion } from '../../shared/suggestions'
import { acceptSuggestion, pendingRanges, rejectSuggestion } from './actions'

export const SUGGESTION_PLUGIN_KEY = new PluginKey('paddoSuggestions')

type Action = 'accept' | 'reject' | 'edit'

/**
 * Buttons carry data attributes and are handled by one delegated listener on the
 * editor root. A per-button closure dies with the widget node, and ProseMirror
 * replaces widget nodes on every transaction — a click whose mousedown already
 * triggered a re-render would land on a detached element.
 */
function actionButton(label: string, title: string, action: Action): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'sug-action'
  button.textContent = label
  button.title = title
  button.setAttribute('aria-label', title)
  button.dataset.sugAction = action
  return button
}

/** Small edit: the proposed text plus a pair of chips, inline at the change. */
function inlineChip(editor: Editor, suggestion: Suggestion): HTMLElement {
  const wrap = document.createElement('span')
  wrap.className = 'sug-chip'
  wrap.contentEditable = 'false'
  wrap.dataset.sugId = suggestion.id

  if (suggestion.kind !== 'delete') {
    const proposed = document.createElement('span')
    proposed.className = 'sug-proposed'
    proposed.textContent = suggestion.proposed
    wrap.append(proposed)
  }

  const actions = document.createElement('span')
  actions.className = 'sug-actions'
  actions.append(
    actionButton('✓', 'Accept this change', 'accept'),
    actionButton('✗', 'Reject this change', 'reject'),
  )
  wrap.append(actions)

  return wrap
}

/** Larger rewrite: a card under the paragraph, with the full text and reason. */
function blockCard(editor: Editor, suggestion: Suggestion): HTMLElement {
  const card = document.createElement('div')
  card.className = 'sug-card'
  card.contentEditable = 'false'
  card.dataset.sugId = suggestion.id

  if (suggestion.rationale) {
    const rationale = document.createElement('p')
    rationale.className = 'sug-rationale'
    rationale.textContent = suggestion.rationale
    card.append(rationale)
  }

  if (suggestion.original) {
    const original = document.createElement('p')
    original.className = 'sug-original'
    original.textContent = suggestion.original
    card.append(original)
  }

  if (suggestion.proposed) {
    const proposed = document.createElement('p')
    proposed.className = 'sug-proposed'
    proposed.textContent = suggestion.proposed
    card.append(proposed)
  }

  const actions = document.createElement('div')
  actions.className = 'sug-actions'
  actions.append(
    actionButton('Accept', 'Accept this change', 'accept'),
    actionButton('Reject', 'Reject this change', 'reject'),
    actionButton('Edit', 'Accept, then select the new text so you can adjust it', 'edit'),
  )
  card.append(actions)

  return card
}

function buildDecorations(editor: Editor): DecorationSet {
  const { doc } = editor.state
  const ranges = pendingRanges(editor)
  if (ranges.length === 0) return DecorationSet.empty

  const decorations: Decoration[] = []

  for (const { suggestion, from, to } of ranges) {
    if (to > from) {
      decorations.push(Decoration.inline(from, to, { class: 'sug-strike' }))
    }

    const large = isLargeSuggestion(suggestion)

    if (!large) {
      decorations.push(
        Decoration.widget(to, () => inlineChip(editor, suggestion), {
          side: 1,
          ignoreSelection: true,
          stopEvent: () => true,
        }),
      )
      continue
    }

    const $to = doc.resolve(Math.min(to, doc.content.size))
    const blockEnd = $to.depth > 0 ? $to.after(1) : $to.pos
    decorations.push(
      Decoration.widget(Math.min(blockEnd, doc.content.size), () => blockCard(editor, suggestion), {
        side: -1,
        ignoreSelection: true,
        stopEvent: () => true,
      }),
    )
  }

  return DecorationSet.create(doc, decorations)
}

export interface SuggestionsOptions {
  /** The same Y.Doc the collaboration extension is bound to. */
  ydoc: Y.Doc | null
}

/**
 * Renders pending suggestions inline. The suggestions live in the Y.Doc, so a
 * review started on the phone is visible on the desktop without extra plumbing.
 */
export const Suggestions = Extension.create<SuggestionsOptions>({
  name: 'paddoSuggestions',

  addOptions() {
    return { ydoc: null }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    const ydoc = this.options.ydoc

    const plugins: Plugin[] = [
      new Plugin({
        key: new PluginKey('paddoSuggestionsActions'),
        view: (view) => {
          const onPointerDown = (event: Event) => {
            const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-sug-action]')
            const id = target?.closest<HTMLElement>('[data-sug-id]')?.dataset.sugId
            if (!target || !id) return
            event.preventDefault()
            event.stopPropagation()
            const action = target.dataset.sugAction
            if (action === 'reject') {
              rejectSuggestion(editor, id)
              return
            }
            if (action !== 'accept' && action !== 'edit') return

            const result = acceptSuggestion(editor, id, { select: action === 'edit' })
            if (result === 'stale') {
              // Never a silent no-op: say what happened, then drop the dead hunk.
              window.dispatchEvent(
                new CustomEvent('paddo:notice', {
                  detail: 'That change can no longer be placed — the text under it has changed. Dropped it.',
                }),
              )
              rejectSuggestion(editor, id)
            }
          }
          view.dom.addEventListener('pointerdown', onPointerDown, true)
          return { destroy: () => view.dom.removeEventListener('pointerdown', onPointerDown, true) }
        },
      }),
      new Plugin({
        key: SUGGESTION_PLUGIN_KEY,
        state: {
          init: () => 0,
          apply: (tr, value) => (tr.getMeta(SUGGESTION_PLUGIN_KEY) ? value + 1 : value),
        },
        props: {
          decorations: (state) => {
            // Reading the version makes ProseMirror recompute after a refresh.
            SUGGESTION_PLUGIN_KEY.getState(state)
            return buildDecorations(editor)
          },
        },
      }),
    ]

    if (ydoc) {
      plugins.push(
        new Plugin({
          key: new PluginKey('paddoSuggestionsWatch'),
          view: () => {
            let queued = false
            const map = ydoc.getMap<Record<string, unknown>>(SUGGESTIONS_MAP)
            const observer = () => {
              if (queued || editor.isDestroyed) return
              queued = true
              queueMicrotask(() => {
                queued = false
                if (editor.isDestroyed) return
                editor.view.dispatch(editor.state.tr.setMeta(SUGGESTION_PLUGIN_KEY, { refresh: true }))
              })
            }
            map.observe(observer)
            return {
              destroy: () => map.unobserve(observer),
            }
          },
        }),
      )
    }

    return plugins
  },
})
