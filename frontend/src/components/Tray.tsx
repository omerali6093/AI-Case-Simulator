import { useEffect, useRef } from 'react'
import type { PatientCase, Phase, Step } from '../types'

interface Props {
  phase: Phase
  currentCase: PatientCase | null
  selectedStep: string | null
  // chat input (asking phase)
  chatInput: string
  chatBusy: boolean
  turnCount: number
  onInputChange: (val: string) => void
  onSendQuestion: (text: string) => void
  onEndQuestioning: () => void
  // legacy (review / deciding)
  onReview: () => void
  onSelectStep: (id: string) => void
  onConfirm: () => void
  onRetry?: () => void
  statusMessage?: string | null
  errorMessage?: string | null
  busy: boolean
}

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

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 96) + 'px'
  }, [chatInput])

  // Focus input whenever we return to asking phase
  useEffect(() => {
    if (phase === 'asking') {
      setTimeout(() => textareaRef.current?.focus(), 80)
    }
  }, [phase])

  const canSend = chatInput.trim().length > 0 && !chatBusy

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canSend) onSendQuestion(chatInput.trim())
    }
  }

  // ── Error state ───────────────────────────────────────────────────────────
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

  // ── Loading / status overlay ──────────────────────────────────────────────
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

  // ── Asking phase — free-form chat input ───────────────────────────────────
  if (phase === 'asking' || (phase === 'talking' && !statusMessage)) {
    return (
      <div className="glass tray" id="tray">

        {/* Turn counter pill */}
        <div className="chat-meta">
          <span className="chat-pill">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {turnCount === 0
              ? 'No questions asked yet'
              : `${turnCount} question${turnCount === 1 ? '' : 's'} asked`}
          </span>
          <button
            type="button"
            className="btn-done"
            onClick={onEndQuestioning}
            aria-label="Finish questioning and review notes"
          >
            Done — Review notes
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Input row */}
        <div className={`chat-input-wrap${chatBusy ? ' busy' : ''}`}>
          {/* Mic icon decoration */}
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
            placeholder="Ask the patient a question…"
            rows={1}
            disabled={chatBusy}
            aria-label="Ask the patient a question"
          />

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

        <p className="fine">
          Press <kbd>Enter</kbd> to send &nbsp;·&nbsp; <kbd>Shift+Enter</kbd> for a new line
        </p>
      </div>
    )
  }

  // ── Review ────────────────────────────────────────────────────────────────
  if (phase === 'review') {
    return (
      <div className="glass tray" id="tray">
        <button type="button" className="btn primary" onClick={onReview}>
          Review case notes
        </button>
      </div>
    )
  }

  // ── Deciding ──────────────────────────────────────────────────────────────
  if (phase === 'deciding' && currentCase) {
    return (
      <div className="glass tray" id="tray">
        <h2>Choose an educational next step</h2>
        <fieldset className="opts" aria-label="Next step">
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
