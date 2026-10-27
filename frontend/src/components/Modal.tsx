import { useEffect } from 'react'
import type { ConsultationResult, HistoryRecord, ModalKind, PatientCase, Phase } from '../types'
import { NotesModal } from './modals/NotesModal'
import { ResultModal } from './modals/ResultModal'
import { RecordsModal } from './modals/RecordsModal'
import { MenuModal } from './modals/MenuModal'

interface Props {
  kind: ModalKind
  dismissible: boolean
  currentCase: PatientCase | null
  revealed: number
  phase: Phase
  result: ConsultationResult | null
  records: HistoryRecord[]
  is3d: boolean
  quality: 'high' | 'low'
  exposure: number
  onClose: () => void
  onToDecide: () => void
  onNextPatient: () => void
  onRecords: () => void
  onQuality: (q: 'high' | 'low') => void
  onExposure: (v: number) => void
  onRestart: () => void
  onSignOut: () => void
}

export function Modal({
  kind,
  dismissible,
  currentCase,
  revealed,
  phase,
  result,
  records,
  is3d,
  quality,
  exposure,
  onClose,
  onToDecide,
  onNextPatient,
  onRecords,
  onQuality,
  onExposure,
  onRestart,
  onSignOut,
}: Props) {
  // Keyboard: Escape closes
  useEffect(() => {
    if (!kind) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [kind, onClose])

  if (!kind) return null

  return (
    <div id="modal">
      <div
        className="scrim"
        onClick={(e) => {
          if (dismissible && (e.target as HTMLElement).classList.contains('scrim')) onClose()
        }}
      >
        <div className="sheet" role="dialog" aria-modal="true">
          {kind === 'notes' && currentCase && (
            <NotesModal
              currentCase={currentCase}
              revealed={revealed}
              phase={phase}
              onClose={onClose}
              onToDecide={onToDecide}
            />
          )}
          {kind === 'result' && result && (
            <ResultModal
              result={result}
              onNext={onNextPatient}
              onRecords={onRecords}
            />
          )}
          {kind === 'records' && (
            <RecordsModal records={records} onClose={onClose} />
          )}
          {kind === 'menu' && (
            <MenuModal
              is3d={is3d}
              quality={quality}
              exposure={exposure}
              onQuality={onQuality}
              onExposure={onExposure}
              onRecords={onRecords}
              onRestart={onRestart}
              onSignOut={onSignOut}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  )
}
