interface Props {
  is3d: boolean
  quality: 'high' | 'low'
  exposure: number
  onQuality: (q: 'high' | 'low') => void
  onExposure: (v: number) => void
  onRecords: () => void
  onRestart: () => void
  onSignOut: () => void
  onClose: () => void
}

export function MenuModal({
  is3d,
  quality,
  exposure,
  onQuality,
  onExposure,
  onRecords,
  onRestart,
  onSignOut,
  onClose,
}: Props) {
  return (
    <>
      <button type="button" className="close" onClick={onClose}>Close</button>
      <h2>Menu</h2>

      {is3d ? (
        <>
          <div>
            <h3>Graphics</h3>
            <div className="seg" role="group" aria-label="Graphics quality">
              <button
                type="button"
                aria-pressed={quality === 'high'}
                onClick={() => onQuality('high')}
              >
                High
              </button>
              <button
                type="button"
                aria-pressed={quality === 'low'}
                onClick={() => onQuality('low')}
              >
                Performance
              </button>
            </div>
            <p className="fine" style={{ marginTop: 6, textAlign: 'left' }}>
              Performance turns off shadows and glow for older integrated GPUs.
            </p>
          </div>
          <div>
            <h3>Brightness</h3>
            <input
              type="range"
              min="0.6"
              max="1.8"
              step="0.05"
              value={exposure}
              aria-label="Brightness"
              onChange={(e) => onExposure(parseFloat(e.target.value) || 1)}
            />
          </div>
        </>
      ) : (
        <p className="sub">
          3D is not available in this browser, so the clinic is shown without graphics. Everything else works.
        </p>
      )}

      <div className="row">
        <button type="button" className="btn" onClick={onRecords}>Patient records</button>
        <button type="button" className="btn" onClick={onRestart}>Restart this patient</button>
      </div>
      <button type="button" className="btn" onClick={onSignOut}>Sign out</button>
      <button type="button" className="btn primary" onClick={onClose}>Resume</button>
    </>
  )
}
