import { useCallback, useEffect, useRef, useState } from 'react'
import { clinicAPI } from './api'
import { AuthScreen } from './components/AuthScreen'
import { HUD } from './components/HUD'
import { Modal } from './components/Modal'
import { SpeechBubble } from './components/SpeechBubble'
import type { BubbleRef } from './components/SpeechBubble'
import { Toast } from './components/Toast'
import { Tray } from './components/Tray'
import { useWorld } from './hooks/useWorld'
import type {
  ChatTurn,
  ConsultationResult,
  HistoryRecord,
  ModalKind,
  PatientCase,
  Phase,
  Progress,
  WorldAnchors,
} from './types'
import { REACTIONS, saveLastUser, uuid } from './utils'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ─── Anchor state shape ───────────────────────────────────────────────────────

const NULL_ANCHOR = { x: 0, y: 0, on: false }

export default function App() {
  // ── Canvas ref ────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // ── Bubble refs ───────────────────────────────────────────────────────────
  const doctorBubbleRef = useRef<BubbleRef | null>(null)
  const patientBubbleRef = useRef<BubbleRef | null>(null)

  // ── World anchors (updated every frame by Three.js) ───────────────────────
  const [anchors, setAnchors] = useState<WorldAnchors>({
    doctor: NULL_ANCHOR,
    patient: NULL_ANCHOR,
  })

  // ── Game state ────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('auth')
  const [username, setUsername] = useState<string | null>(null)
  const [currentCase, setCurrentCase] = useState<PatientCase | null>(null)
  const [revealed, setRevealed] = useState(0)
  const [selectedStep, setSelectedStep] = useState<string | null>(null)
  const [result, setResult] = useState<ConsultationResult | null>(null)
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [progress, setProgress] = useState<Progress>({ totalPoints: 0, level: 1, completed: 0 })
  const [busy, setBusy] = useState(false)
  const [quality, setQuality] = useState<'high' | 'low'>('high')
  const [exposure, setExposure] = useState(1)
  const [authLeaving, setAuthLeaving] = useState(false)
  const [showHud, setShowHud] = useState(false)
  const [showDisclaimer, setShowDisclaimer] = useState(true)

  // ── Tray status / error ───────────────────────────────────────────────────
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // ── Chat input ────────────────────────────────────────────────────────────
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // ── Modal ─────────────────────────────────────────────────────────────────
  const [modal, setModal] = useState<{ kind: ModalKind; dismissible: boolean }>({ kind: null, dismissible: true })

  // ── Cancellation token (mirrors original S.token) ─────────────────────────
  const tokenRef = useRef(0)

  // ── Attempt id for idempotent submit ──────────────────────────────────────
  const attemptRef = useRef<string>('')

  // ── Screen reader announcement ────────────────────────────────────────────
  const [srText, setSrText] = useState('')

  // ─── World hooks (stable, delegated to latest values via closure) ──────────
  const worldHooks = {
    onAnchors: useCallback((a: WorldAnchors) => setAnchors(a), []),
    doctorVisible: useCallback(() => phase !== 'auth', [phase]),
    onDowngrade: useCallback((msg: string) => {
      setQuality('low')
      setToastMsg(msg)
    }, []),
  }

  const worldRef = useWorld(canvasRef, worldHooks)

  // ── Helper: speak a line of dialogue ──────────────────────────────────────
  const say = useCallback(async (who: 'doctor' | 'patient', text: string) => {
    const bubbleRef = who === 'doctor' ? doctorBubbleRef : patientBubbleRef
    const world = worldRef.current
    setSrText((who === 'doctor' ? `Dr. ${username ?? 'You'}` : (currentCase?.name ?? 'Patient')) + ': ' + text)
    await bubbleRef.current?.say(text, (on) => world?.setSpeaking(who, on))
  }, [username, currentCase, worldRef])

  // ── Consultation flow ─────────────────────────────────────────────────────

  const begin = useCallback(async (reuseCase: boolean) => {
    const tok = ++tokenRef.current
    const world = worldRef.current
    setPhase('arriving')
    setRevealed(0)
    setSelectedStep(null)
    setResult(null)
    setBusy(false)
    setChatHistory([])
    setChatInput('')
    setChatBusy(false)
    attemptRef.current = uuid()
    setModal({ kind: null, dismissible: true })
    world?.resetPatient()
    world?.setDoctorMode('rest')
    setStatusMsg('Your next patient is arriving…')
    setErrorMsg(null)
    world?.setShot('arrival')

    let c = currentCase
    if (!reuseCase || !c) {
      try {
        c = await clinicAPI.nextCase()
      } catch (e: unknown) {
        if (tok !== tokenRef.current) return
        const err = e as { status?: number; message?: string }
        if (err?.status === 401) { setToastMsg('Your session expired. Please sign in again.'); signOut(); return }
        setStatusMsg(null)
        setErrorMsg((err?.message) || 'Something went wrong.')
        return
      }
      if (tok !== tokenRef.current) return
      setCurrentCase(c)
    }

    world?.setPatientLook(c!)
    await world?.patientEnter()
    if (tok !== tokenRef.current) return
    world?.setShot('patientCU')
    await sleep(700)
    if (tok !== tokenRef.current) return
    setStatusMsg(null)
    // Patient sits quietly — doctor speaks first.
    // The opening complaint is shown as a subtle status hint, not spoken aloud.
    setPhase('asking')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCase, say, worldRef])

  const sendQuestion = useCallback(async (text: string) => {
    if (phase !== 'asking' || !currentCase || chatBusy) return

    // Cancellation token — if the user navigates away mid-call we bail out.
    const tok = tokenRef.current

    // ── 1. Optimistic UI: clear the input and lock the tray ─────────────────
    setChatInput('')
    setChatBusy(true)
    setPhase('talking')

    // ── 2. Animate the doctor's speech bubble ──────────────────────────────
    worldRef.current?.setShot('wide')
    await say('doctor', text)
    if (tok !== tokenRef.current) return

    // Record the doctor's turn in history immediately (before awaiting the AI)
    const historyWithDoctor: ChatTurn[] = [...chatHistory, { role: 'doctor', text }]
    setChatHistory(historyWithDoctor)

    // Small pause so the doctor bubble finishes before the patient "thinks"
    await sleep(380)
    if (tok !== tokenRef.current) return

    // ── 3. Camera cuts to the patient while we wait for the AI reply ────────
    worldRef.current?.setShot('patientCU')

    // ── 4. Call the AI ──────────────────────────────────────────────────────
    // We pass historyWithDoctor (which already includes this question) so the
    // backend receives the complete conversation for context.
    let reply = ''
    let aiError = false

    try {
      const res = await clinicAPI.chat(currentCase.id, text, historyWithDoctor)
      reply = res.reply
    } catch {
      // Don't crash — let the patient give a graceful "not sure" response.
      // Show a subtle toast so the doctor knows the AI had a hiccup.
      aiError = true
      reply = "I'm sorry, I'm not sure how to answer that."
    }

    if (tok !== tokenRef.current) return

    // ── 5. Animate the patient's reply ─────────────────────────────────────
    await say('patient', reply)
    if (tok !== tokenRef.current) return

    // Record the patient's reply in history
    setChatHistory((prev) => [...prev, { role: 'patient', text: reply }])

    // ── 6. Unlock the tray ──────────────────────────────────────────────────
    await sleep(250)
    if (tok !== tokenRef.current) return

    setChatBusy(false)
    setPhase('asking')

    // Show a non-blocking toast if the AI call failed (so it's obvious to dev)
    if (aiError) {
      setToastMsg('AI response failed — showing fallback answer.')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentCase, chatBusy, chatHistory, say, worldRef])

  const endQuestioning = useCallback(() => {
    // Move to review phase and open the notes modal so the doctor
    // can read the transcript before choosing a next step.
    setPhase('review')
    worldRef.current?.setShot('wide')
    setStatusMsg(null)
    setModal({ kind: 'notes', dismissible: true })
  }, [worldRef])

  const confirm = useCallback(async () => {
    if (phase !== 'deciding' || !selectedStep || busy || !currentCase) return
    const tok = ++tokenRef.current
    const picked = selectedStep
    setBusy(true)
    setStatusMsg('Saving your plan…')
    setModal({ kind: null, dismissible: true })

    let res: { result: ConsultationResult; progress: Progress }
    try {
      res = await clinicAPI.submit(currentCase.id, picked, attemptRef.current)
    } catch (e: unknown) {
      setBusy(false)
      if (tok !== tokenRef.current) return
      const err = e as { status?: number; message?: string }
      if (err?.status === 401) { setToastMsg('Your session expired. Please sign in again.'); signOut(); return }
      setToastMsg((err?.message) || 'Could not save the consultation. Try again.')
      setStatusMsg(null)
      setPhase('deciding')
      return
    }
    setBusy(false)
    if (tok !== tokenRef.current) return

    const step = currentCase.steps.find((s) => s.id === picked)!
    setProgress(res.progress)
    setPhase('reacting')
    setStatusMsg(null)
    worldRef.current?.setDoctorMode('write')
    worldRef.current?.setShot('wide')
    await say('doctor', 'Here is my plan: ' + step.label + '.')
    if (tok !== tokenRef.current) return
    worldRef.current?.setDoctorMode('rest')
    await sleep(350)
    if (tok !== tokenRef.current) return
    worldRef.current?.setShot('patientCU')
    const r = res.result
    await say('patient', r.score >= 80 ? REACTIONS.high : r.score >= 50 ? REACTIONS.mid : REACTIONS.low)
    if (tok !== tokenRef.current) return
    await sleep(700)
    if (tok !== tokenRef.current) return
    setResult(r)
    setRecords((prev) => [
      { patient: currentCase.name, title: r.title, step: r.step, score: r.score, max: r.max, at: new Date().toISOString() },
      ...prev,
    ])
    setPhase('result')
    worldRef.current?.setShot('wide')
    worldRef.current?.patientLeave().then(() => {
      if (tokenRef.current === tok) { /* patient gone, noop in React */ }
    })
    setModal({ kind: 'result', dismissible: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, selectedStep, busy, currentCase, say, worldRef])

  // ── Auth callbacks ─────────────────────────────────────────────────────────

  function enterGame(name: string, prog: Progress) {
    setUsername(name)
    setProgress(prog)
    setRecords([])
    setCurrentCase(null)
    saveLastUser(name)
    setAuthLeaving(true)
    setShowDisclaimer(false)
    setTimeout(() => {
      setShowHud(true)
      setAuthLeaving(false)
      setToastMsg('Welcome, Dr. ' + name + '. Your shift starts now.')
      begin(false)
    }, 450)
    clinicAPI.history().then((rs) => {
      setRecords(rs)
    }).catch(() => { /* records are optional */ })
  }

  function signOut() {
    tokenRef.current++
    setPhase('auth')
    setUsername(null)
    setCurrentCase(null)
    setRecords([])
    setProgress({ totalPoints: 0, level: 1, completed: 0 })
    setBusy(false)
    setModal({ kind: null, dismissible: true })
    setStatusMsg(null)
    setErrorMsg(null)
    worldRef.current?.resetPatient()
    worldRef.current?.setShot('auth')
    setShowHud(false)
    setShowDisclaimer(true)
    clinicAPI.logout().catch(() => { /* ignore */ })
  }

  // ── World shot on phase change ─────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'auth') worldRef.current?.setShot('auth')
  }, [phase, worldRef])

  // ── Modal helpers ──────────────────────────────────────────────────────────

  function openNotes() { setModal({ kind: 'notes', dismissible: true }) }
  function openMenu() { setModal({ kind: 'menu', dismissible: true }) }
  function openRecords() { setModal({ kind: 'records', dismissible: true }) }

  function closeOrReturn() {
    setModal({ kind: null, dismissible: true })
    if (phase === 'result' && result) {
      setTimeout(() => setModal({ kind: 'result', dismissible: false }), 0)
    }
  }

  function handleToDecide() {
    setModal({ kind: null, dismissible: true })
    setPhase('deciding')
    setStatusMsg(null)
  }

  function handleNextPatient() {
    setModal({ kind: null, dismissible: true })
    const tok = tokenRef.current
    setStatusMsg('Next patient, please…')
    worldRef.current?.patientLeave().then(() => {
      if (tok !== tokenRef.current) return
      begin(false)
    })
  }

  function handleQuality(q: 'high' | 'low') {
    worldRef.current?.setQuality(q)
    setQuality(worldRef.current?.getQuality() ?? q)
  }

  function handleExposure(v: number) {
    setExposure(v)
    worldRef.current?.setExposure(v)
  }

  // ── Tray error retry ───────────────────────────────────────────────────────
  function handleRetry() {
    setErrorMsg(null)
    begin(false)
  }

  // ── Determine tray visibility ──────────────────────────────────────────────
  const showTray = showHud && ['asking', 'talking', 'review', 'deciding', 'arriving', 'reacting'].includes(phase) || !!statusMsg || !!errorMsg

  const is3d = worldRef.current?.is3d ?? false

  return (
    <>
      <canvas id="gl" ref={canvasRef} aria-label="3D view of the clinic" role="img" />

      {/* Speech bubbles layer */}
      <div id="bubbles" aria-hidden="true">
        <SpeechBubble
          who="doctor"
          label={`Dr. ${username ?? 'You'}`}
          tagMeta="You"
          anchor={showHud && phase !== 'auth' ? anchors.doctor : NULL_ANCHOR}
          bubbleClass="dr"
          bubbleRefCallback={(ref) => { doctorBubbleRef.current = ref }}
        />
        <SpeechBubble
          who="patient"
          label={currentCase?.name ?? 'Patient'}
          tagMeta={currentCase ? `Age ${currentCase.age}` : ''}
          anchor={showHud && phase !== 'auth' ? anchors.patient : NULL_ANCHOR}
          bubbleClass="pt"
          bubbleRefCallback={(ref) => { patientBubbleRef.current = ref }}
        />
      </div>

      {/* SR announcements */}
      <div id="sr" className="sr" aria-live="polite">{srText}</div>

      <div id="ui">
        {/* Auth screen */}
        {!showHud && (
          <AuthScreen onEnter={enterGame} leaving={authLeaving} />
        )}

        {/* HUD */}
        {showHud && username && (
          <HUD
            username={username}
            progress={progress}
            onNotes={openNotes}
            onMenu={openMenu}
          />
        )}

        {/* Tray */}
        {showHud && (
          <Tray
            phase={phase}
            currentCase={currentCase}
            selectedStep={selectedStep}
            chatInput={chatInput}
            chatBusy={chatBusy}
            turnCount={chatHistory.filter((t) => t.role === 'doctor').length}
            onInputChange={setChatInput}
            onSendQuestion={sendQuestion}
            onEndQuestioning={endQuestioning}
            onReview={openNotes}
            onSelectStep={(id) => setSelectedStep(id)}
            onConfirm={confirm}
            onRetry={handleRetry}
            statusMessage={showTray ? statusMsg : null}
            errorMessage={errorMsg}
            busy={busy}
          />
        )}

        {/* Modal */}
        <Modal
          kind={modal.kind}
          dismissible={modal.dismissible}
          currentCase={currentCase}
          chatHistory={chatHistory}
          phase={phase}
          result={result}
          records={records}
          is3d={is3d}
          quality={quality}
          exposure={exposure}
          onClose={closeOrReturn}
          onToDecide={handleToDecide}
          onNextPatient={handleNextPatient}
          onRecords={openRecords}
          onQuality={handleQuality}
          onExposure={handleExposure}
          onRestart={() => { setModal({ kind: null, dismissible: true }); begin(true) }}
          onSignOut={signOut}
        />

        <Toast message={toastMsg} onDone={() => setToastMsg(null)} />

        {showDisclaimer && (
          <p className="disclaimer">
            Educational simulation with fictional patients. Not medical advice or a diagnostic service, and four-question outcomes are not real-world diagnoses.
          </p>
        )}
      </div>
    </>
  )
}
