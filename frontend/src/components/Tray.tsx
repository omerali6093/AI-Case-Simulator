import type { PatientCase, Phase, Step } from '../types'

const Q = 4

interface Props {
  phase: Phase
  currentCase: PatientCase | null
  revealed: number
  selectedStep: string | null
  hinted: boolean
  onAsk: () => void
  onReview: () => void
  onSelectStep: (id: string) => void
  onConfirm: () => void
  onRetry?: () => void
  statusMessage?: string | null
  errorMessage?: string | null
  busy: boolean
}

function ProgressDots({ revealed }: { revealed: number }) {
  return (
    <div className="prog">
      <span className="dots">
        {Array.from({ length: Q }, (_, i) => (
          <i key={i} className={i < revealed ? 'on' : ''} />
        ))}
      </span>
      <span>
        Interview {Math.min(revealed + (revealed < Q ? 1 : 0), Q)} of {Q}
      </span>
    </div>
  )
}

export function Tray({
  phase,
  currentCase,
  revealed,
  selectedStep,
  hinted,
  onAsk,
  onReview,
  onSelectStep,
  onConfirm,
  onRetry,
  statusMessage,
  errorMessage,
  busy,
}: Props) {
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

  if (phase === 'asking' && currentCase) {
    const q = currentCase.qs[revealed]
    return (
      <div className="glass tray" id="tray">
        <ProgressDots revealed={revealed} />
        <button type="button" className="ask" onClick={onAsk}>
          <span className="chip">Ask</span>
          <span className="q">"{q.prompt}"</span>
        </button>
        {!hinted && (
          <p className="fine">Tip: tap a speech bubble to skip the typing.</p>
        )}
      </div>
    )
  }

  if (phase === 'review') {
    return (
      <div className="glass tray" id="tray">
        <ProgressDots revealed={revealed} />
        <button type="button" className="btn primary" onClick={onReview}>
          Review case notes
        </button>
      </div>
    )
  }

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
