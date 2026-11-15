/**
 * Keeping a document's markdown as it was written.
 *
 * The editor's markdown serializer escapes what it cannot represent as markup: raw
 * HTML in the prose comes back as `&lt;!-- page: … --&gt;`, an ampersand as `&amp;`, and a
 * bracket that would otherwise look like a link becomes `\[image: …\]`. In the file the
 * writer reads, `Lead Product Designer &amp; Design Engineer` is a bug: the text in the
 * editor is the truth, so the serializer's escaping is undone here.
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
    .map((part, index) => {
      // Odd indexes are the fenced blocks between the split captures.
      if (index % 2 === 1) return part
      return (
        part
          // The serializer escapes exactly these three in prose, so one unescape is the
          // inverse of it. `&amp;` goes last: a writer who typed `&lt;` gets `&amp;lt;` in
          // the file, and restoring the ampersand first would turn it into a tag.
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
      )
    })
    .join('')
}
