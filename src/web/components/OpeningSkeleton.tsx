/**
 * The placeholder while a document opens. It covers both waits a reader can run
 * into: fetching the editor bundle, and syncing the document over the socket.
 */
export function OpeningSkeleton({ title, fading = false }: { title?: string; fading?: boolean }) {
  // Decoration only: the header's status line already says what is happening.
  return (
    <div className={`skeleton${fading ? ' is-fading' : ''}`} aria-hidden="true">
      {title ? <p className="skeleton__title">{title}</p> : null}
      {/* Two paragraphs of fake prose, so the bars sit on the same rhythm as real ones. */}
      {[[100, 96, 92, 61], [88, 100, 74]].map((lines, paragraph) => (
        <p className="skeleton__para" key={paragraph}>
          {lines.map((width, line) => (
            <span key={line} className="skeleton__line" style={{ width: `${width}%` }} />
          ))}
        </p>
      ))}
    </div>
  )
}

/** "the-quiet-interface" → "The quiet interface", for the placeholder heading. */
export function humanizeSlug(slug: string): string {
  const words = slug.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
