/**
 * Keeping a document's markdown as it was written.
 *
 * The editor's markdown serializer escapes what it cannot represent as markup: raw
 * HTML in the prose comes back as `&lt;!-- page: … --&gt;` and a bracket that would
 * otherwise look like a link becomes `\[image: …\]`. For a document imported from a
 * pipeline those escapes are noise in the file the writer reads.
 *
 * Code is left alone on purpose: the serializer never touched it, and a sample's
 * escapes are the author's.
 *
 * Known limit: the bracket escapes stay as they are — the bake step on the other side
 * of the pipeline unescapes them, and unescaping here would make a real escaped
 * bracket indistinguishable from prose.
 */
export function restoreRawHtml(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?```)/g)
    .map((part, index) =>
      // Odd indexes are the fenced blocks between the split captures.
      index % 2 === 1 ? part : part.replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
    )
    .join('')
}
