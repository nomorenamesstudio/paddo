/**
 * Phase 0 probe: can the server derive, store and re-resolve Yjs relative
 * positions headless — no browser, no ProseMirror view, no binding mapping?
 *
 * The trick under test: anchors are created against the Y.XmlText node that
 * holds the quoted characters, so the conversion is a flat-text offset, not a
 * ProseMirror position. y-prosemirror builds the same kind of relative
 * position internally, so a client can resolve ours with its own mapping.
 */
import * as Y from 'yjs'
import { getSchema } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { Italic } from '@tiptap/extension-italic'
import { Link } from '@tiptap/extension-link'
import { prosemirrorJSONToYDoc, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import { MarkdownManager } from '@tiptap/markdown'
import { Node as PMNode } from '@tiptap/pm/model'

const schema = getSchema([
  StarterKit.configure({ italic: false }),
  Italic.extend({ renderMarkdown: (node, h) => `_${h.renderChildren(node)}_` }),
  Link,
])

const markdown = `# Hello\n\nA calm surface is not a lack of power. It is power made quiet.\n\n> A quote, quietly.\n`
const md = new MarkdownManager({ extensions: [StarterKit, Link] })
const json = md.parse(markdown)

const yDoc = prosemirrorJSONToYDoc(schema, json, 'content')
const fragment = yDoc.getXmlFragment('content')

/** Every Y.XmlText in document order, so flat-text offsets survive. */
function textNodes(node: Y.XmlFragment | Y.XmlElement, out: Y.XmlText[] = []): Y.XmlText[] {
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText) out.push(child)
    else if (child instanceof Y.XmlElement) textNodes(child, out)
  }
  return out
}

function findByQuote(quote: string): Y.RelativePosition | null {
  for (const text of textNodes(fragment)) {
    const hit = text.toString().indexOf(quote)
    if (hit !== -1) return Y.createRelativePositionFromTypeIndex(text, hit, 0)
  }
  return null
}

const quote = 'It is power made quiet.'
const anchor = findByQuote(quote)
console.log('anchor created:', anchor !== null)

// Mutate elsewhere in the document — the user typing above the anchor.
const first = textNodes(fragment)[1]
if (!first) throw new Error('fixture did not produce a second text node')
first.insert(0, 'Totally new opening. ')
console.log('mutated before the anchor')

const absolute = Y.createAbsolutePositionFromRelativePosition(anchor!, yDoc)
console.log('anchor resolved:', absolute !== null)
if (absolute) {
  console.log('quoted text still at anchor:', absolute.type.toString().slice(absolute.index, absolute.index + quote.length))
}

// And the markdown path the server needs on save: Y state -> PM node -> .md
const pmDoc = yXmlFragmentToProseMirrorRootNode(fragment, schema)
console.log('Y -> PM headless:', pmDoc instanceof PMNode, 'text length', pmDoc.textContent.length)

// Restart simulation: encode, decode into a fresh doc, re-resolve the anchor.
const encoded = Y.encodeStateAsUpdate(yDoc)
const restored = new Y.Doc()
Y.applyUpdate(restored, encoded)
const restoredAnchor = Y.createAbsolutePositionFromRelativePosition(
  Y.decodeRelativePosition(Y.encodeRelativePosition(anchor!)),
  restored,
)
console.log('anchor survives restart:', restoredAnchor?.type.toString().slice(restoredAnchor.index, restoredAnchor.index + quote.length) === quote)
