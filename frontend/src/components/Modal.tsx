import { useEffect } from 'react'
import type { ChatTurn, ConsultationResult, HistoryRecord, ModalKind, PatientCase, Phase } from '../types'
import { MenuModal } from './modals/MenuModal'
import { NotesModal } from './modals/NotesModal'
import { RecordsModal } from './modals/RecordsModal'
import { ResultModal } from './modals/ResultModal'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  kind: ModalKind
  dismissible: boolean
  currentCase: PatientCase | null
  chatHistory: ChatTurn[]       // real conversation transcript (replaces static qs)
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

// ─── Component ────────────────────────────────────────────────────────────────

export function Modal({
  kind,
  dismissible,
  currentCase,
  chatHistory,
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
  // Close on Escape
  useEffect(() => {
    if (!kind) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [kind, dismissible, onClose])

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
              chatHistory={chatHistory}
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
