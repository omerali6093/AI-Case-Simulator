import type { HistoryRecord } from '../../types'

interface Props {
  records: HistoryRecord[]
  onClose: () => void
}

export function RecordsModal({ records, onClose }: Props) {
  return (
    <>
      <button type="button" className="close" onClick={onClose}>Close</button>
      <h2>Patient records</h2>
      <p className="sub">Fictional patients from your past consultations</p>

      {records.length > 0 ? (
        <ul className="recs">
          {records.slice(0, 30).map((r, i) => {
            const d = new Date(r.at)
            const ds = isNaN(d.getTime())
              ? ''
              : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
            return (
              <li key={i}>
                <span>
                  <b>{r.patient}</b>
                  <small>{r.title}</small>
                  <small>Next step: {r.step} · {ds}</small>
                </span>
                <span className="sc">{r.score}/{r.max}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="panel">
          <p>No consultations yet. Your finished patients appear here.</p>
        </div>
      )}

      <button type="button" className="btn" onClick={onClose}>
        Back to the clinic
      </button>
    </>
  )
}
