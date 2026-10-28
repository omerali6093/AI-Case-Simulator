// ─── Domain types ────────────────────────────────────────────────────────────

export interface PatientLook {
  skin: string
  hair: string
  hairStyle: 'long' | 'short' | 'pony'
  top: string
  bottom: string
  prop?: string
  beard?: boolean
  mood?: number
}

export interface Question {
  prompt: string
  answer: string
}

export interface Step {
  id: string
  label: string
  detail: string
}

export interface PatientCase {
  id: string
  title: string
  name: string
  age: number
  look: PatientLook
  complaint: string
  qs: Question[]
  steps: Step[]
}

export interface ConsultationResult {
  title: string
  step: string
  score: number
  max: number
  feedback: string
  note: string
}

export interface Progress {
  totalPoints: number
  level: number
  completed: number
  averageScore?: number
}

export interface HistoryRecord {
  patient: string
  title: string
  step: string
  score: number
  max: number
  at: string
}

// ─── Game phase ──────────────────────────────────────────────────────────────

export type Phase =
  | 'auth'
  | 'arriving'
  | 'asking'
  | 'talking'
  | 'review'
  | 'deciding'
  | 'reacting'
  | 'result'

// ─── Modal kinds ─────────────────────────────────────────────────────────────

export type ModalKind = 'notes' | 'result' | 'records' | 'menu' | null

// ─── World API (world.js typed interface) ─────────────────────────────────────

export interface WorldAnchors {
  doctor: { x: number; y: number; on: boolean }
  patient: { x: number; y: number; on: boolean }
}

export interface WorldHooks {
  onAnchors: (anchors: WorldAnchors) => void
  doctorVisible: () => boolean
  onDowngrade: (msg: string) => void
}

export interface WorldAPI {
  is3d: boolean
  setShot: (shot: 'auth' | 'arrival' | 'wide' | 'patientCU' | 'doctorCU') => void
  setPatientLook: (c: PatientCase) => void
  patientEnter: () => Promise<void>
  patientLeave: () => Promise<void>
  resetPatient: () => void
  setSpeaking: (who: 'doctor' | 'patient', on: boolean) => void
  setDoctorMode: (mode: 'rest' | 'write') => void
  isPatientVisible: () => boolean
  setQuality: (q: 'high' | 'low') => void
  getQuality: () => 'high' | 'low'
  setExposure: (v: number) => void
  info: () => { calls: number; tris: number }
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface ChatTurn {
  role: 'doctor' | 'patient'
  text: string
}

// ─── API client interface ─────────────────────────────────────────────────────

export interface ClinicAPI {
  ready: Promise<'remote' | 'demo'>
  mode: () => 'remote' | 'demo'
  login: (username: string, password: string) => Promise<{ user: { username: string }; progress: Progress }>
  register: (username: string, password: string) => Promise<{ user: { username: string }; progress: Progress }>
  logout: () => Promise<void>
  nextCase: () => Promise<PatientCase>
  chat: (caseId: string, message: string, history: ChatTurn[]) => Promise<{ reply: string }>
  submit: (
    caseId: string,
    stepId: string,
    clientId: string
  ) => Promise<{ result: ConsultationResult; progress: Progress }>
  history: () => Promise<HistoryRecord[]>
}
