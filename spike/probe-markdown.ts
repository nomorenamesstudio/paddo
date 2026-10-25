/**
 * Phase 0 probe: is Tiptap's MarkdownManager usable headless in Node, and what
 * happens to `_italics_` / em dashes / smart quotes on a round-trip?
 *
 * Throwaway investigation, not a test.
 */
import { readFileSync } from 'node:fs'
import { StarterKit } from '@tiptap/starter-kit'
import { Link } from '@tiptap/extension-link'
import { MarkdownManager } from '@tiptap/markdown'

const source = readFileSync(new URL('../content/the-quiet-interface.md', import.meta.url), 'utf8')

const md = new MarkdownManager({ extensions: [StarterKit, Link] })

const json = md.parse(source)
const out = md.serialize(json)

console.log('parsed top nodes:', json.content?.length)
console.log('--- serialized ---')
console.log(out)
console.log('--- round-trip identical:', out === source)

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
