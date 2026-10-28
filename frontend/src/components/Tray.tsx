import { useEffect, useRef } from 'react'
import type { PatientCase, Phase, Step } from '../types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  phase: Phase
  currentCase: PatientCase | null
  selectedStep: string | null

  // Chat input (asking phase)
  chatInput: string
  chatBusy: boolean
  turnCount: number
  onInputChange: (val: string) => void
  onSendQuestion: (text: string) => void
  onEndQuestioning: () => void

  // Review / deciding / error
  onReview: () => void
  onSelectStep: (id: string) => void
  onConfirm: () => void
  onRetry?: () => void

  // Status / error messages shown by the parent
  statusMessage?: string | null
  errorMessage?: string | null
  busy: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Tray({
  phase,
  currentCase,
  selectedStep,
  chatInput,
  chatBusy,
  turnCount,
  onInputChange,
  onSendQuestion,
  onEndQuestioning,
  onReview,
  onSelectStep,
  onConfirm,
  onRetry,
  statusMessage,
  errorMessage,
  busy,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Auto-resize textarea as the user types ───────────────────────────────
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 96) + 'px'
  }, [chatInput])

  // ── Auto-focus the input whenever we land in the asking phase ────────────
  useEffect(() => {
    if (phase === 'asking') {
      setTimeout(() => textareaRef.current?.focus(), 80)
    }
  }, [phase])

  const canSend = chatInput.trim().length > 0 && !chatBusy

  // Submit on Enter (Shift+Enter inserts a newline instead)
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canSend) onSendQuestion(chatInput.trim())
    }
  }

  // ── 1. Error state ────────────────────────────────────────────────────────
  if (errorMessage && onRetry) {
    return (
      <div className="glass tray" id="tray">
        <p className="status err">
          <span className="pulse" />
          {errorMessage}
        </p>
        <button type="button" className="btn primary" onClick={onRetry}>
          Try again
        </button>
      </div>
    )
  }

  // ── 2. Loading / status overlay ───────────────────────────────────────────
  if (statusMessage) {
    return (
      <div className="glass tray" id="tray">
        <p className="status">
          <span className="pulse" />
          {statusMessage}
        </p>
      </div>
    )
  }

  // ── 3. Asking phase — free-form chat input ────────────────────────────────
  //       Also shown during 'talking' (patient is replying) so the tray stays
  //       visible but the textarea is disabled while chatBusy is true.
  if (phase === 'asking' || phase === 'talking') {
    return (
      <div className="glass tray" id="tray">

        {/* Top row: patient complaint hint + "Done" button */}
        <div className="chat-meta">

          {/* Complaint hint — shown only before the first question */}
          {turnCount === 0 && currentCase ? (
            <span className="chat-pill complaint-hint">
              {/* Stethoscope icon */}
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="11" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.4" />
                <path
                  d="M3 3.5A1.5 1.5 0 0 1 4.5 2h.25A1.25 1.25 0 0 1 6 3.25v3A3.75 3.75 0 0 0 9.75 10H10"
                  stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
                />
              </svg>
              {currentCase.name} is waiting — start the consultation
            </span>
          ) : (
            /* Turn counter pill after the first question */
            <span className="chat-pill">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {turnCount} question{turnCount === 1 ? '' : 's'} asked
            </span>
          )}

          {/* "Done" button — always visible so doctor can end any time */}
          <button
            type="button"
            className="btn-done"
            onClick={onEndQuestioning}
            disabled={chatBusy}
            aria-label="Finish questioning and review case notes"
          >
            Done — Review notes
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Input wrapper */}
        <div className={`chat-input-wrap${chatBusy ? ' busy' : ''}`}>

          {/* Microphone / stethoscope decoration */}
          <span className="chat-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none">
              <rect x="7" y="2" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.6" />
              <path d="M4 10a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="10" y1="16" x2="10" y2="19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>

          <textarea
            ref={textareaRef}
            className="chat-input"
            value={chatInput}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              chatBusy
                ? 'Patient is responding…'
                : 'Ask the patient a question…'
            }
            rows={1}
            disabled={chatBusy}
            aria-label="Ask the patient a question"
          />

          {/* Send button — lights up mint when there is text to send */}
          <button
            type="button"
            className={`chat-send${canSend ? ' ready' : ''}`}
            disabled={!canSend}
            onClick={() => onSendQuestion(chatInput.trim())}
            aria-label="Send question"
          >
            {chatBusy ? (
              <span className="send-spinner" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M3 10L17 3l-4.5 7L17 17 3 10Z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>

        {/* Keyboard shortcut hint */}
        <p className="fine">
          Press <kbd>Enter</kbd> to send &nbsp;·&nbsp; <kbd>Shift+Enter</kbd> for a new line
        </p>

      </div>
    )
  }

  // ── 4. Review phase — prompt the doctor to open notes ────────────────────
  if (phase === 'review') {
    return (
      <div className="glass tray" id="tray">
        <button type="button" className="btn primary" onClick={onReview}>
          Review case notes
        </button>
      </div>
    )
  }

  // ── 5. Deciding phase — step selection ───────────────────────────────────
  if (phase === 'deciding' && currentCase) {
    return (
      <div className="glass tray" id="tray">
        <h2>Choose an educational next step</h2>
        <fieldset className="opts" aria-label="Next step options">
          {currentCase.steps.map((s: Step) => (
            <label
              key={s.id}
              className={`opt${selectedStep === s.id ? ' on' : ''}`}
            >
              <input
                type="radio"
                name="next-step"
                value={s.id}
                checked={selectedStep === s.id}
                onChange={() => onSelectStep(s.id)}
              />
              <span>
                <b>{s.label}</b>
                <span className="d">{s.detail}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          className="btn primary"
          disabled={!selectedStep || busy}
          onClick={onConfirm}
        >
          Confirm and advise patient
        </button>
      </div>
    )
  }

  return null
}
