import type { PatientCase } from '../../types'

const Q = 4

interface Props {
  currentCase: PatientCase
  revealed: number
  phase: string
  onClose: () => void
  onToDecide?: () => void
}

export function NotesModal({ currentCase: c, revealed, phase, onClose, onToDecide }: Props) {
  const showDecideButton =
    revealed >= Q &&
    phase !== 'deciding' &&
    phase !== 'reacting' &&
    !!onToDecide

  return (
    <>
      <button type="button" className="close" onClick={onClose}>Close</button>
      <h2>Case notes</h2>
      <p className="sub">{c.name}, age {c.age} · fictional patient</p>

      <div className="panel">
        <h3>Presenting complaint</h3>
        <p>"{c.complaint}"</p>
      </div>

      <div className="panel">
        <h3>Interview ({revealed} of {Q})</h3>
        {revealed > 0 ? (
          <ul className="qa">
            {c.qs.slice(0, revealed).map((q, i) => (
              <li key={i}>
                <div className="you">You asked: {q.prompt}</div>
                <div><b>{c.name}:</b> {q.answer}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sub" style={{ margin: '6px 0 0' }}>No answers yet.</p>
        )}
      </div>

      {showDecideButton ? (
        <button type="button" className="btn primary" onClick={onToDecide}>
          Choose a next step
        </button>
      ) : (
        <button type="button" className="btn" onClick={onClose}>
          Back to the consultation
        </button>
      )}
    </>
  )
}
