import type { Progress } from '../types'

interface Props {
  username: string
  progress: Progress
  onNotes: () => void
  onMenu: () => void
}

export function HUD({ username, progress, onNotes, onMenu }: Props) {
  const pts = progress.totalPoints ?? 0
  const lvl = progress.level ?? 1
  const completed = progress.completed ?? 0
  const xp = (pts % 250) / 250

  return (
    <section id="hud">
      <div className="hud-top">
        <div className="glass doc">
          <span className="avatar" aria-hidden="true">
            {(username || 'DR').slice(0, 2).toUpperCase()}
          </span>
          <span className="doc-text">
            <b className="doc-name">Dr. {username}</b>
            <span className="doc-meta">Level {lvl} · {completed} seen</span>
            <div className="xp">
              <i style={{ width: `${Math.round(xp * 100)}%` }} />
            </div>
          </span>
        </div>

        <div className="hud-actions">
          <button
            type="button"
            className="glass icon-btn"
            onClick={onNotes}
            aria-label="Case notes"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="4" width="14" height="17" rx="2"/>
              <path d="M9 4h6v3H9z"/>
              <path d="M9 12h6M9 16h4"/>
            </svg>
            Notes
          </button>
          <button
            type="button"
            className="glass icon-btn"
            onClick={onMenu}
            aria-label="Menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16"/>
            </svg>
            Menu
          </button>
        </div>
      </div>
    </section>
  )
}
