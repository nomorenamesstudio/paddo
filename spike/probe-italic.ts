/**
 * Phase 0 probe: can the `_italic_` convention be forced through Tiptap's
 * markdown serializer, and is the round-trip then byte-stable?
 *
 * Throwaway investigation, not a test.
 */
import { readFileSync } from 'node:fs'
import { StarterKit } from '@tiptap/starter-kit'
import { Italic } from '@tiptap/extension-italic'
import { Link } from '@tiptap/extension-link'
import { MarkdownManager } from '@tiptap/markdown'

const source = readFileSync(new URL('../content/the-quiet-interface.md', import.meta.url), 'utf8')

const UnderscoreItalic = Italic.extend({
  renderMarkdown: (node, h) => `_${h.renderChildren(node)}_`,
})

const md = new MarkdownManager({
  extensions: [StarterKit.configure({ italic: false }), UnderscoreItalic, Link],
})

const json = md.parse(source)
const out = md.serialize(json)
const twice = md.serialize(md.parse(out))

console.log('parsed top nodes:', json.content?.length)
console.log('round-trip identical:', out === source)
console.log('idempotent on second pass:', twice === out)

if (out !== source) {
  const a = source.split('\n')
  const b = out.split('\n')
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.log(`first diff at line ${i + 1}`)
      console.log('  in :', JSON.stringify(a[i]))
      console.log('  out:', JSON.stringify(b[i]))
      break
    }
  }
}

// Which marks survived parsing?
const marks = new Set<string>()
const walk = (n: any) => {
  if (n?.marks) for (const m of n.marks) marks.add(m.type)
  if (n?.content) n.content.forEach(walk)
}
walk(json)
console.log('marks seen:', [...marks].join(', '))

// Files are written with exactly one trailing newline.
console.log('identical with trailing newline normalized:', out + '\n' === source)
