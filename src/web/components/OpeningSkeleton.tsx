/**
 * The placeholder while a document opens. It covers both waits a reader can run
 * into: fetching the editor bundle, and syncing the document over the socket.
 */
export function OpeningSkeleton({ title, fading = false }: { title?: string; fading?: boolean }) {
  return (
    <div className={`skeleton${fading ? ' is-fading' : ''}`} aria-live="polite" aria-busy="true">
      {title ? <p className="skeleton__title">{title}</p> : null}
      {[100, 92, 97, 64, 88, 95, 76].map((width, index) => (
        <span key={index} className="skeleton__line" style={{ width: `${width}%` }} />
      ))}
      <p className="skeleton__note">opening the document…</p>
    </div>
  )
}

/** "the-quiet-interface" → "The quiet interface", for the placeholder heading. */
export function humanizeSlug(slug: string): string {
  const words = slug.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
