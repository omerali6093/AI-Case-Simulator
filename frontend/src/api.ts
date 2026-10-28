/**
 * API client. Talks to the Express backend when it is reachable, otherwise
 * falls back to the offline demo so the app works without a server.
 * Sessions are httpOnly cookies; no token is ever visible to this script.
 */
import type { ChatTurn, ClinicAPI, ConsultationResult, HistoryRecord, PatientCase, Progress } from './types'
import { DEMO_CASES } from './demoData'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined ?? '').replace(/\/$/, '')

// ─── Error shape ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number
  retryable: boolean
  constructor(message: string, status: number, retryable: boolean) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryable = retryable
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ─── Fetch wrapper with retry ─────────────────────────────────────────────────

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; retries?: number } = {}
): Promise<T> {
  const method = opts.method ?? 'GET'
  const retries = opts.retries ?? (method === 'GET' ? 2 : 0)
  let last: ApiError | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(350 * Math.pow(2, attempt - 1))
    try {
      const res = await fetch(BASE + path, {
        method,
        credentials: 'include',
        headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      })
      if (res.ok) return (res.status === 204 ? null : await res.json()) as T
      let msg = 'Something went wrong.'
      try {
        const data = await res.json()
        if (data?.error?.message) msg = data.error.message
      } catch {
        /* not JSON */
      }
      last = new ApiError(msg, res.status, res.status >= 500)
    } catch {
      last = new ApiError('Cannot reach the server. Check your connection and try again.', 0, true)
    }
    if (!last.retryable) break
  }
  throw last!
}

// ─── Remote implementation ────────────────────────────────────────────────────

type AuthResponse = { user: { username: string }; progress: Progress }

const remote = {
  mode: 'remote' as const,
  login: (u: string, p: string) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: { username: u, password: p } }),
  register: (u: string, p: string) =>
    request<AuthResponse>('/api/auth/register', { method: 'POST', body: { username: u, password: p } }),
  logout: () => request<null>('/api/auth/logout', { method: 'POST' }).then(() => undefined),
  nextCase: () =>
    request<{ case: PatientCase }>('/api/cases/next').then((r) => r.case),
  submit: (caseId: string, stepId: string, clientId: string) =>
    request<{ record: Record<string, unknown>; progress: Progress }>('/api/consultations', {
      method: 'POST',
      body: { caseId, stepId, clientId },
      retries: 2,
    }).then((r) => {
      const rec = r.record as {
        caseTitle: string; stepLabel: string; score: number; maxScore: number; feedback: string; educationalNote: string
      }
      return {
        result: {
          title: rec.caseTitle,
          step: rec.stepLabel,
          score: rec.score,
          max: rec.maxScore,
          feedback: rec.feedback,
          note: rec.educationalNote,
        } as ConsultationResult,
        progress: r.progress,
      }
    }),
  history: () =>
    request<{ records: Record<string, unknown>[] }>('/api/consultations?limit=100').then((r) =>
      r.records.map(
        (x) =>
          ({
            patient: x.patientName,
            title: x.caseTitle,
            step: x.stepLabel,
            score: x.score,
            max: x.maxScore,
            at: x.completedAt,
          }) as HistoryRecord
      )
    ),
  chat: (caseId: string, message: string, history: ChatTurn[]) =>
    request<{ reply: string }>('/api/chat', {
      method: 'POST',
      body: { caseId, message, history },
    }),
}

// ─── Demo (offline) implementation ───────────────────────────────────────────

const DEMO_KEY = 'clinic-sim-demo-v3'

function demoLoad(): Array<{ user: string; patient: string; title: string; step: string; score: number; max: number; at: string }> {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) ?? '{}').records ?? []
  } catch {
    return []
  }
}
function demoSave(records: ReturnType<typeof demoLoad>) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify({ records: records.slice(0, 100) }))
  } catch { /* optional */ }
}

let demoUser: string | null = null

function demoProgress(): Progress {
  const rs = demoLoad().filter((r) => r.user === demoUser)
  const pts = rs.reduce((a, r) => a + r.score, 0)
  return { totalPoints: pts, level: 1 + Math.floor(pts / 250), completed: rs.length, averageScore: rs.length ? Math.round((pts / rs.length) * 10) / 10 : 0 }
}

function later<T>(v: T, ms = 500): Promise<T> {
  return new Promise((r) => setTimeout(() => r(v), ms))
}

function demoEnter(name: string): Promise<AuthResponse> {
  demoUser = name
  return later({ user: { username: name }, progress: demoProgress() })
}

const demo = {
  mode: 'demo' as const,
  login: (u: string) => demoEnter(u),
  register: (u: string) => demoEnter(u),
  logout: (): Promise<void> => {
    demoUser = null
    return Promise.resolve()
  },
  nextCase: (): Promise<PatientCase> => {
    const mine = demoLoad().filter((r) => r.user === demoUser)
    const c = DEMO_CASES[mine.length % DEMO_CASES.length]
    return Promise.resolve({
      id: c.caseId,
      title: c.title,
      name: c.patientName,
      age: c.age,
      look: c.look as PatientCase['look'],
      complaint: c.complaint,
      qs: c.questions,
      steps: c.steps.map((s) => ({ id: s.id, label: s.label, detail: s.detail })),
    })
  },
  submit: (caseId: string, stepId: string): Promise<{ result: ConsultationResult; progress: Progress }> => {
    const c = DEMO_CASES.find((x) => x.caseId === caseId)
    const s = c?.steps.find((x) => x.id === stepId)
    if (!s || !c) return Promise.reject(Object.assign(new Error('Unknown step.'), { status: 400 }))
    const all = demoLoad()
    all.unshift({ user: demoUser!, patient: c.patientName, title: c.title, step: s.label, score: s.points, max: 100, at: new Date().toISOString() })
    demoSave(all)
    return later({
      result: { title: c.title, step: s.label, score: s.points, max: 100, feedback: s.feedback, note: c.educationalNote },
      progress: demoProgress(),
    })
  },
  history: (): Promise<HistoryRecord[]> => {
    const mine = demoLoad().filter((r) => r.user === demoUser)
    return Promise.resolve(mine.map((r) => ({ patient: r.patient, title: r.title, step: r.step, score: r.score, max: r.max, at: r.at })))
  },
  chat: (caseId: string, message: string, history: ChatTurn[]): Promise<{ reply: string }> => {
    // Offline fallback when there is no live backend.
    //
    // Strategy:
    //   1. Try to find a Q&A whose prompt shares keywords with the doctor's message.
    //   2. If nothing matches well, fall back to answering in order (nth question).
    //   3. Never return the same answer twice — skip already-used ones.
    //
    const c = DEMO_CASES.find((x) => x.caseId === caseId)
    if (!c) return Promise.resolve({ reply: "I'm not sure about that." })

    // Figure out which Q&As have already been answered in this conversation
    const usedAnswers = new Set(
      history
        .filter((t) => t.role === 'patient')
        .map((t) => t.text)
    )

    // Tokenise the doctor's message into lowercase words for matching
    const questionWords = message.toLowerCase().split(/\W+/).filter(Boolean)

    // Score each Q&A by how many keywords from the doctor's question appear
    // in the Q&A prompt text
    const scored = c.questions.map((q, idx) => {
      const promptWords = q.prompt.toLowerCase().split(/\W+/)
      const matchCount  = questionWords.filter((w) => promptWords.includes(w)).length
      return { idx, matchCount, q }
    })

    // Pick the best-matching, not-yet-used answer
    const ranked = scored
      .filter((s) => !usedAnswers.has(s.q.answer))   // skip already-given answers
      .sort((a, b) => b.matchCount - a.matchCount)    // highest match score first

    // If we found a keyword match, use it; otherwise fall back to the next unused one
    const doctorTurnCount = history.filter((t) => t.role === 'doctor').length - 1
    const fallback = c.questions.find((q) => !usedAnswers.has(q.answer))
               ?? c.questions[doctorTurnCount % c.questions.length]

    const chosen = (ranked[0]?.matchCount ?? 0) > 0 ? ranked[0].q : fallback

    return later({ reply: chosen?.answer ?? "I'm not sure about that." }, 700)
  },
}

// ─── Public API (with server-detection and ready promise) ─────────────────────

let impl: typeof remote | typeof demo = demo

const ready: Promise<'remote' | 'demo'> = (async () => {
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 2500)
    const res = await fetch(BASE + '/api/health', { signal: ctl.signal, credentials: 'include' })
    clearTimeout(t)
    const j: { ok?: boolean } = res.ok ? await res.json() : {}
    if (j?.ok) impl = remote
  } catch {
    /* no server: stay in demo mode */
  }
  return impl.mode
})()

export const clinicAPI: ClinicAPI = {
  ready,
  mode: () => impl.mode,
  login: (u, p) => ready.then(() => impl.login(u, p)),
  register: (u, p) => ready.then(() => impl.register(u, p)),
  logout: () => ready.then(() => impl.logout()),
  nextCase: () => ready.then(() => impl.nextCase()),
  chat: (caseId, message, history) => ready.then(() => impl.chat(caseId, message, history)),
  submit: (caseId, stepId, clientId) => ready.then(() => impl.submit(caseId, stepId, clientId)),
  history: () => ready.then(() => impl.history()),
}
