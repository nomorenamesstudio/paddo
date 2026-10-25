import { MarkdownManager } from '@tiptap/markdown'
import { baseExtensions } from '../src/shared/editor'

const md = new MarkdownManager({ extensions: baseExtensions() })

function doc(attrs: Record<string, unknown>) {
  return {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'link', attrs }], text: 'a link' }] },
    ],
  }
}

const cases: Array<[string, Record<string, unknown>]> = [
  ['href only', { href: 'https://example.com' }],
  ['href + rel', { href: 'https://example.com', rel: 'noopener noreferrer' }],
  ['href + target', { href: 'https://example.com', target: '_blank' }],
  ['href + nulls', { href: 'https://example.com', target: null, rel: 'noopener noreferrer', class: null, title: null }],
]

for (const [name, attrs] of cases) {
  console.log(name.padEnd(18), JSON.stringify(md.serialize(doc(attrs) as never)))
}
