import { useState } from 'react'

export function InviteSheet({
  title,
  prompt,
  guide,
  includeGuide,
  onToggleGuide,
  onClose,
  onCopied,
}: {
  title: string
  prompt: string
  /** The saved guide, or '' when there is none. */
  guide: string
  includeGuide: boolean
  onToggleGuide: (next: boolean) => void
  onClose: () => void
  onCopied: () => void
}) {
  const [instruction, setInstruction] = useState('Tighten the prose. Cut the flab, keep the voice.')
  const [copied, setCopied] = useState(false)

  const full = `${prompt}\n\nInstruction: ${instruction.trim() || '(say what you want changed)'}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(full)
      setCopied(true)
      onCopied()
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Invite the agent">
      <div className="sheet__panel">
        <div className="sheet__head">
          <h2>Invite the agent</h2>
          <button className="sheet__close" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p className="muted">
          Paddō does not run the model. Copy this into your own agent session — it has the MCP
          command and the rules for proposing edits. Hunks appear here as soon as they arrive.
        </p>

        {guide.trim() ? (
          <label className="sheet__toggle">
            <input
              type="checkbox"
              checked={includeGuide}
              onChange={(event) => onToggleGuide(event.target.checked)}
            />
            <span>Include the writing guide</span>
            <span className="sheet__toggle-meta">{guide.trim().split(/\s+/).length} words</span>
          </label>
        ) : null}

        <label className="field">
          <span className="field__label">What should it do to “{title}”?</span>
          <input
            className="field__input"
            type="text"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
          />
        </label>

        {/* Scrollable, so it has to be reachable with the keyboard. */}
        <pre className="sheet__prompt" tabIndex={0} aria-label="Invitation prompt">
          {full}
        </pre>

        <div className="sheet__actions">
          <button className="button button--ghost" type="button" onClick={onClose}>
            Close
          </button>
          <button className="button button--primary" type="button" onClick={copy}>
            {copied ? 'Copied' : 'Copy prompt'}
          </button>
        </div>
      </div>
    </div>
  )
}
