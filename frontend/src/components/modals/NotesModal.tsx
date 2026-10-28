import type { ChatTurn, PatientCase } from '../../types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  currentCase: PatientCase
  chatHistory: ChatTurn[]   // live conversation — replaces the old static qs list
  phase: string
  onClose: () => void
  onToDecide?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotesModal({ currentCase: c, chatHistory, phase, onClose, onToDecide }: Props) {
  // Show the "Choose a next step" button only after the doctor has finished
  // questioning and is now in the review phase (not yet deciding or later).
  const showDecideButton =
    chatHistory.length > 0 &&
    phase !== 'deciding' &&
    phase !== 'reacting' &&
    !!onToDecide

  return (
    <>
      <button type="button" className="close" onClick={onClose}>Close</button>

      <h2>Case notes</h2>
      <p className="sub">{c.name}, age {c.age} · fictional patient</p>

      {/* Presenting complaint — always visible as a reference */}
      <div className="panel">
        <h3>Presenting complaint</h3>
        <p>"{c.complaint}"</p>
      </div>

      {/* Live conversation transcript */}
      <div className="panel">
        <h3>Consultation transcript</h3>

        {chatHistory.length === 0 ? (
          <p className="sub" style={{ margin: '6px 0 0' }}>
            No questions asked yet.
          </p>
        ) : (
          <ul className="chat-log" aria-label="Conversation transcript">
            {chatHistory.map((turn, i) => (
              <li
                key={i}
                className={`chat-log-item ${turn.role === 'doctor' ? 'chat-log-doctor' : 'chat-log-patient'}`}
              >
                {/* Speaker label */}
                <span className="chat-log-label">
                  {turn.role === 'doctor' ? 'You' : c.name}
                </span>

                {/* Message text */}
                <p className="chat-log-text">{turn.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Action buttons */}
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
