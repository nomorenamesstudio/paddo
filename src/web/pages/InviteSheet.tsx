import { useState } from 'react'

export function InviteSheet({
  title,
  prompt,
  onClose,
  onCopied,
}: {
  title: string
  prompt: string
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
        <header className="sheet__head">
          <h2>Invite the agent</h2>
          <button className="sheet__close" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <p className="muted">
          Paddō does not run the model. Copy this into your own agent session — it has the MCP
          command and the rules for proposing edits. Hunks appear here as soon as they arrive.
        </p>

        <label className="field">
          <span className="field__label">What should it do to “{title}”?</span>
          <input
            className="field__input"
            type="text"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
          />
        </label>

        <pre className="sheet__prompt">{full}</pre>

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
