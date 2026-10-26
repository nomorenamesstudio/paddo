import { Loader2 } from 'lucide-react'

/** "the-quiet-interface" → "The quiet interface", for the placeholder heading. */
export function humanizeSlug(slug: string): string {
  const words = slug.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * What the editor shows while the document is on its way. One quiet line, because
 * there is nothing to read yet and a skeleton of fake text pretends otherwise.
 */
export function LoadingDocument({
  label = 'reading the file',
  fading = false,
}: {
  label?: string
  fading?: boolean
}) {
  return (
    <div className={`loading${fading ? ' is-fading' : ''}`} role="status" aria-live="polite">
      <Loader2 size={18} className="spin" aria-hidden="true" />
      <span className="loading__label">{label}…</span>
    </div>
  )
}
