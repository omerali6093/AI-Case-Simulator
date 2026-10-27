import { useEffect, useRef } from 'react'
import type { ConsultationResult } from '../../types'
import { rating, stars } from '../../utils'

function StarSvg({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4L2.8 9.3l6.4-.8z"
        fill={on ? '#ffc26b' : 'rgba(255,255,255,.14)'}
      />
    </svg>
  )
}

interface Props {
  result: ConsultationResult
  onNext: () => void
  onRecords: () => void
}

export function ResultModal({ result: r, onNext, onRecords }: Props) {
  const ringRef = useRef<SVGCircleElement>(null)
  const numRef = useRef<HTMLElement>(null)
  const n = stars(r.score)

  useEffect(() => {
    // Trigger ring animation on next frame
    requestAnimationFrame(() => {
      if (ringRef.current) {
        ringRef.current.style.strokeDashoffset = String(326.7 * (1 - r.score / 100))
      }
      const t0 = performance.now()
      const el = numRef.current
      if (!el) return
      const tick = (now: number) => {
        if (!el.isConnected) return
        const p = Math.min(1, (now - t0) / 1000)
        el.textContent = String(Math.round(r.score * p))
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  }, [r.score])

  return (
    <>
      <h2>Consultation complete</h2>
      <p className="sub">{r.title}</p>

      <div className="result">
        <div className="ring">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle className="bg" cx="60" cy="60" r="52" />
            <circle className="fg" ref={ringRef} cx="60" cy="60" r="52" />
          </svg>
          <b ref={numRef} aria-label="Score">0</b>
        </div>
        <div>
          <div className="stars" aria-hidden="true">
            {Array.from({ length: 3 }, (_, i) => <StarSvg key={i} on={i < n} />)}
          </div>
          <div className="rate">{rating(r.score)}</div>
          <div className="sub" style={{ margin: '2px 0 0' }}>out of {r.max}</div>
        </div>
      </div>

      <div className="panel">
        <h3>Your choice</h3>
        <p><b>{r.step}</b></p>
        <p>{r.feedback}</p>
      </div>

      <div className="panel">
        <h3>What to take away</h3>
        <p>{r.note}</p>
      </div>

      <div className="row">
        <button type="button" className="btn primary" onClick={onNext}>
          Next patient
        </button>
        <button type="button" className="btn" onClick={onRecords}>
          Patient records
        </button>
      </div>
    </>
  )
}
