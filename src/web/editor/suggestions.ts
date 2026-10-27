import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import * as Y from 'yjs'

import { SUGGESTIONS_MAP, type Suggestion } from '../../shared/suggestions'
import { acceptSuggestion, pendingRanges, rejectSuggestion } from './actions'

export const SUGGESTION_PLUGIN_KEY = new PluginKey('paddoSuggestions')

type Action = 'accept' | 'reject' | 'edit'

/**
 * Buttons carry data attributes and are handled by one delegated listener on the
 * editor root. A per-button closure dies with the widget node, and ProseMirror
 * replaces widget nodes on every transaction — a click whose mousedown already
 * triggered a re-render would land on a detached element.
 */
const ICONS: Record<Action, string> = {
  accept: 'M20 6 9 17l-5-5',
  reject: 'M18 6 6 18M6 6l12 12',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
}

function actionButton(label: string, title: string, action: Action): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'sug-action'
  // The visible word is the accessible name; the explanation is a tooltip only,
  // otherwise screen readers hear a name that does not contain what is on screen.
  button.title = title
  button.dataset.sugAction = action

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', ICONS[action])
  svg.append(path)

  const text = document.createElement('span')
  text.textContent = label
  button.append(svg, text)
  return button
}

/**
 * One hunk, one anatomy: the reason, the text it replaces, the replacement, the
 * actions. Every hunk sits under the block it changes. Short replacements happen
 * to fit on one row and long ones wrap to three; nothing else about them differs,
 * which is the point — the earlier inline chip had no rationale and no Edit, so a
 * spelling fix and a rewritten paragraph looked like two different features.
 */
function hunkWidget(suggestion: Suggestion): HTMLElement {
  const hunk = document.createElement('div')
  hunk.className = 'sug-hunk'
  hunk.contentEditable = 'false'
  hunk.dataset.sugId = suggestion.id

  if (suggestion.rationale) {
    const rationale = document.createElement('p')
    rationale.className = 'sug-rationale'
    rationale.textContent = suggestion.rationale
    hunk.append(rationale)
  }

  const swap = document.createElement('div')
  swap.className = 'sug-swap'

  if (suggestion.original) {
    const original = document.createElement('span')
    original.className = 'sug-original'
    original.textContent = suggestion.original
    swap.append(original)
  }

  if (suggestion.proposed) {
    const proposed = document.createElement('span')
    proposed.className = 'sug-proposed'
    proposed.textContent = suggestion.proposed
    swap.append(proposed)
  }

  hunk.append(swap)

  if (suggestion.conflict) {
    const conflict = document.createElement('p')
    conflict.className = 'sug-conflict'
    conflict.textContent = suggestion.conflict
    hunk.append(conflict)
    hunk.classList.add('sug-hunk--conflict')
  }

  const actions = document.createElement('div')
  actions.className = 'sug-actions'
  if (suggestion.conflict) {
    // Applying it would splice stale text into an accepted sentence.
    const accept = actionButton('Accept', 'Accept this change', 'accept')
    const edit = actionButton('Edit', 'Accept, then select the new text so you can adjust it', 'edit')
    for (const button of [accept, edit]) {
      button.disabled = true
      button.title = 'Cannot be applied: it overlaps a change you already accepted'
    }
    actions.append(accept, actionButton('Reject', 'Reject this change', 'reject'), edit)
  } else {
    actions.append(
      actionButton('Accept', 'Accept this change', 'accept'),
      actionButton('Reject', 'Reject this change', 'reject'),
      actionButton('Edit', 'Accept, then select the new text so you can adjust it', 'edit'),
    )
  }
  hunk.append(actions)

  return hunk
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

    // Both sizes sit under the block they change, so the eye looks in one place.
    const $to = doc.resolve(Math.min(to, doc.content.size))
    const blockEnd = $to.depth > 0 ? $to.after(1) : $to.pos
    decorations.push(
      Decoration.widget(Math.min(blockEnd, doc.content.size), () => hunkWidget(suggestion), {
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
            if (result === 'conflict') {
              window.dispatchEvent(
                new CustomEvent('paddo:notice', {
                  detail: 'That change overlaps one you already accepted. Reject it and ask for a fresh one.',
                }),
              )
              return
            }
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
