// Dependency-free dev server: same HTTP contract as the Express + MongoDB backend, stored in a
// JSON file instead of MongoDB, and no npm install needed (Node 20+). Use it to try the game
// quickly:   node dev/memory-server.mjs     then open http://localhost:4000
// It is for development and demos only. Production uses src/ (Express + MongoDB).
import { createServer } from 'node:http'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const PORT = Number(process.env.PORT || 4000)
const FRONTEND = resolve(
  process.env.FRONTEND_DIR || join(here, '../../frontend')
)
const DATA_FILE = process.env.DATA_FILE || join(here, '.dev-data.json')
const AUTH_MAX = Number(process.env.AUTH_MAX || 10)
const CASES = JSON.parse(
  readFileSync(join(here, '../src/seed/cases.data.json'), 'utf8')
).sort((a, b) => a.order - b.order)

// ── Load the Groq API key from backend/.env (if present) ─────────────────────
// This lets the memory-server use real AI responses without needing MongoDB.
let GROQ_API_KEY = process.env.GROQ_API_KEY || ''
if (!GROQ_API_KEY) {
  try {
    const envFile = readFileSync(join(here, '../.env'), 'utf8')
    const match = envFile.match(/^GROQ_API_KEY=(.+)$/m)
    if (match) GROQ_API_KEY = match[1].trim()
  } catch {
    /* .env not found — AI will use fallback */
  }
}
if (GROQ_API_KEY) {
  console.log('Groq AI key loaded — AI patient responses are active.')
} else {
  console.log(
    'No GROQ_API_KEY found — AI patient will use static fallback answers.'
  )
}

let db = { users: [], consultations: [] }
if (DATA_FILE !== ':memory:' && existsSync(DATA_FILE)) {
  try {
    db = JSON.parse(readFileSync(DATA_FILE, 'utf8'))
  } catch {
    /* start fresh */
  }
}
const save = () => {
  if (DATA_FILE !== ':memory:') writeFileSync(DATA_FILE, JSON.stringify(db))
}
const sessions = new Map() // token -> userId
const attempts = new Map() // ip -> { n, reset }

const hash = (pw, salt = randomBytes(16).toString('hex')) =>
  `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`
const verify = (pw, stored) => {
  const [salt, h] = stored.split(':')
  return timingSafeEqual(Buffer.from(h, 'hex'), scryptSync(pw, salt, 32))
}
const DUMMY = hash('not-a-real-password')

class HttpError extends Error {
  constructor (status, message) {
    super(message)
    this.status = status
  }
}
const summarise = (total, n) => ({
  totalPoints: total,
  level: 1 + Math.floor(total / 250),
  completed: n,
  averageScore: n ? Math.round((total / n) * 10) / 10 : 0
})
const progressOf = u => {
  const mine = db.consultations.filter(c => c.userId === u.id)
  return summarise(
    mine.reduce((a, c) => a + c.score, 0),
    mine.length
  )
}
const publicCase = c => ({
  id: c.caseId,
  title: c.title,
  name: c.patientName,
  age: c.age,
  look: c.look,
  complaint: c.complaint,
  qs: c.questions,
  steps: c.steps.map(({ id, label, detail }) => ({ id, label, detail }))
})
const record = (c, u) => ({
  id: c.id,
  username: u.username,
  caseId: c.caseId,
  caseTitle: c.caseTitle,
  patientName: c.patientName,
  stepId: c.stepId,
  stepLabel: c.stepLabel,
  score: c.score,
  maxScore: 100,
  feedback: c.feedback,
  educationalNote: c.educationalNote,
  completedAt: c.completedAt
})

const send = (res, status, body, headers = {}) => {
  const json = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  })
  res.end(json)
}
const parseCookies = (h = '') =>
  Object.fromEntries(
    h
      .split(';')
      .map(p => p.trim().split('='))
      .filter(p => p[0])
  )
const readBody = req =>
  new Promise((ok, fail) => {
    let size = 0
    const chunks = []
    req.on('data', d => {
      size += d.length
      if (size > 10_000) {
        fail(new HttpError(413, 'Request body is too large.'))
        req.destroy()
      } else chunks.push(d)
    })
    req.on('end', () => {
      if (!chunks.length) return ok({})
      try {
        ok(JSON.parse(Buffer.concat(chunks).toString()))
      } catch {
        fail(new HttpError(400, 'Request body is not valid JSON.'))
      }
    })
  })
const isStr = (v, min, max) =>
  typeof v === 'string' && v.length >= min && v.length <= max

function userFrom (req) {
  const id = sessions.get(parseCookies(req.headers.cookie).clinic_session)
  return id ? db.users.find(u => u.id === id) : null
}
const setSession = (res, user) => {
  const token = randomBytes(32).toString('hex')
  sessions.set(token, user.id)
  return `clinic_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${
    7 * 86400
  }`
}

// ── Groq AI helper ────────────────────────────────────────────────────────────
// Builds the patient persona prompt and calls the Groq API.
// Returns the patient's reply as a plain string.

async function callGroq (patientCase, doctorMessage, history) {
  // Build first-person knowledge from the case Q&A pairs
  const knowledgeLines = patientCase.questions
    .map(q => `- ${q.answer}`)
    .join('\n')

  const systemPrompt = `
You are role-playing as a patient in a medical education training simulator.
A trainee doctor will ask you questions. Respond as that patient — honestly, naturally, in plain everyday language.

ABOUT YOU
Name    : ${patientCase.patientName}
Age     : ${patientCase.age} years old
Reason for visit: ${patientCase.complaint}

WHAT YOU KNOW ABOUT YOUR OWN SITUATION
${knowledgeLines}

HOW TO BEHAVE
• Speak like a real person — natural, slightly worried, not clinical.
• Keep every reply to 1–3 short sentences. No long paragraphs.
• Only answer what the doctor directly asked. Don't volunteer extra details yet.
• If asked something you wouldn't know (blood tests, scan results), say so naturally.
• Show mild emotion — worry, discomfort, or relief — without being dramatic.

STRICT RULES
1. You are the PATIENT — never act as a doctor, assistant, or narrator.
2. Never suggest a diagnosis or recommend a treatment.
3. Never invent symptoms not listed above.
4. Plain spoken sentences only — no XML tags, no bullet points, no formatting.
5. Never acknowledge that you are an AI or that this is a simulation.
`.trim()

  // Map conversation history to OpenAI-style messages
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(turn => ({
      role: turn.role === 'doctor' ? 'user' : 'assistant',
      content: turn.text
    })),
    { role: 'user', content: doctorMessage }
  ]

  // Call Groq via plain fetch (no SDK needed in this standalone file)
  const response = await fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'qwen/qwen3.8-27b',
        messages,
        max_tokens: 150,
        temperature: 0.7
      }),
      signal: AbortSignal.timeout(15_000) // 15-second timeout
    }
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(
      err?.error?.message ?? `Groq returned HTTP ${response.status}`
    )
  }

  const data = await response.json()
  const raw = data.choices?.[0]?.message?.content ?? ''

  // Strip <think>…</think> reasoning blocks that some models include
  return (
    raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() ||
    "I'm not sure how to answer that."
  )
}

async function api (req, res, url) {
  const { pathname } = url,
    method = req.method
  if (pathname === '/api/health') return send(res, 200, { ok: true })

  // ── CORS / origin check ───────────────────────────────────────────────────
  // Allow same-origin requests AND the Vite dev server (port 5173) so the
  // frontend dev server can talk to this backend without a proxy error.
  if (method !== 'GET') {
    const o = req.headers.origin
    const serverOrigin = `http://${req.headers.host}`
    const viteOrigin = `http://localhost:5173`
    if (o && o !== serverOrigin && o !== viteOrigin) {
      throw new HttpError(403, 'Request origin not allowed.')
    }
  }

  // ── CORS response headers — let the browser read the response ────────────
  if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  }
  // Pre-flight
  if (method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (pathname === '/api/auth/register' || pathname === '/api/auth/login') {
    const ip = req.socket.remoteAddress || '?',
      now = Date.now()
    const a =
      attempts.get(ip) && attempts.get(ip).reset > now
        ? attempts.get(ip)
        : { n: 0, reset: now + 15 * 60_000 }
    attempts.set(ip, a)
    if (++a.n > AUTH_MAX)
      throw new HttpError(429, 'Too many attempts. Try again in a few minutes.')
    const b = await readBody(req)
    if (Object.keys(b).some(k => k !== 'username' && k !== 'password'))
      throw new HttpError(400, 'Unexpected field.')
    if (pathname.endsWith('register')) {
      if (!isStr(b.username, 3, 24))
        throw new HttpError(400, 'Username must be 3-24 characters.')
      if (!/^[A-Za-z0-9_]+$/.test(b.username))
        throw new HttpError(400, 'Use letters, numbers and underscores only.')
      if (!isStr(b.password, 8, 128))
        throw new HttpError(400, 'Password must be at least 8 characters.')
      if (db.users.some(u => u.key === b.username.toLowerCase()))
        throw new HttpError(409, 'That doctor name is already taken.')
      const user = {
        id: randomBytes(8).toString('hex'),
        username: b.username,
        key: b.username.toLowerCase(),
        pw: hash(b.password)
      }
      db.users.push(user)
      save()
      return send(
        res,
        201,
        { user: { username: user.username }, progress: progressOf(user) },
        { 'Set-Cookie': setSession(res, user) }
      )
    }
    if (!isStr(b.username, 1, 64) || !isStr(b.password, 1, 128))
      throw new HttpError(400, 'Username and password are required.')
    const user = db.users.find(u => u.key === b.username.trim().toLowerCase())
    const ok = verify(b.password, user ? user.pw : DUMMY)
    if (!user || !ok) throw new HttpError(401, 'Invalid username or password.')
    return send(
      res,
      200,
      { user: { username: user.username }, progress: progressOf(user) },
      { 'Set-Cookie': setSession(res, user) }
    )
  }
  if (pathname === '/api/auth/logout' && method === 'POST') {
    sessions.delete(parseCookies(req.headers.cookie).clinic_session)
    return send(res, 204, undefined, {
      'Set-Cookie': 'clinic_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
    })
  }

  const user = userFrom(req)
  if (!user) throw new HttpError(401, 'Please sign in.')
  if (pathname === '/api/auth/me')
    return send(res, 200, {
      user: { username: user.username },
      progress: progressOf(user)
    })
  if (pathname === '/api/progress')
    return send(res, 200, { progress: progressOf(user) })
  if (pathname === '/api/cases/next')
    return send(res, 200, {
      case: publicCase(
        CASES[
          db.consultations.filter(c => c.userId === user.id).length %
            CASES.length
        ]
      )
    })
  if (pathname === '/api/cases')
    return send(res, 200, { cases: CASES.map(publicCase) })

  if (pathname === '/api/consultations' && method === 'GET') {
    const limit = Number(url.searchParams.get('limit') ?? 50),
      page = Number(url.searchParams.get('page') ?? 1)
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(page) ||
      page < 1
    )
      throw new HttpError(400, 'Invalid paging.')
    const mine = db.consultations
      .filter(c => c.userId === user.id)
      .sort(
        (a, b) => b.completedAt.localeCompare(a.completedAt) || b.seq - a.seq
      )
    return send(res, 200, {
      records: mine
        .slice((page - 1) * limit, page * limit)
        .map(c => record(c, user)),
      page,
      limit
    })
  }
  if (pathname === '/api/consultations' && method === 'POST') {
    const b = await readBody(req)
    if (Object.keys(b).some(k => !['caseId', 'stepId', 'clientId'].includes(k)))
      throw new HttpError(400, 'Unexpected field.')
    if (
      !isStr(b.caseId, 1, 64) ||
      !/^[A-Za-z0-9_-]+$/.test(b.caseId) ||
      !isStr(b.stepId, 1, 64) ||
      !/^[A-Za-z0-9_-]+$/.test(b.stepId) ||
      !isStr(b.clientId, 8, 64) ||
      !/^[A-Za-z0-9-]+$/.test(b.clientId)
    )
      throw new HttpError(400, 'Invalid id.')
    const existing = db.consultations.find(
      c => c.userId === user.id && c.clientId === b.clientId
    )
    if (existing) {
      if (existing.caseId !== b.caseId || existing.stepId !== b.stepId)
        throw new HttpError(
          409,
          'That request id was already used for a different consultation.'
        )
      return send(res, 200, {
        record: record(existing, user),
        progress: progressOf(user)
      })
    }
    const pc = CASES.find(c => c.caseId === b.caseId)
    if (!pc) throw new HttpError(404, 'Unknown patient case.')
    const step = pc.steps.find(s => s.id === b.stepId)
    if (!step) throw new HttpError(400, 'Unknown next step for this case.')
    const row = {
      id: randomBytes(8).toString('hex'),
      seq: db.consultations.length,
      userId: user.id,
      clientId: b.clientId,
      caseId: pc.caseId,
      caseTitle: pc.title,
      patientName: pc.patientName,
      stepId: step.id,
      stepLabel: step.label,
      score: step.points,
      feedback: step.feedback,
      educationalNote: pc.educationalNote,
      completedAt: new Date().toISOString()
    }
    db.consultations.push(row)
    save()
    return send(res, 201, {
      record: record(row, user),
      progress: progressOf(user)
    })
  }
  // ── /api/chat — AI patient response via Groq ─────────────────────────────
  if (pathname === '/api/chat' && method === 'POST') {
    if (!user) throw new HttpError(401, 'Please sign in.')
    const b = await readBody(req)

    // Validate the request body
    if (!b.caseId || typeof b.caseId !== 'string')
      throw new HttpError(400, 'caseId is required.')
    if (!b.message || typeof b.message !== 'string')
      throw new HttpError(400, 'message is required.')
    if (b.message.length > 500) throw new HttpError(400, 'Message is too long.')

    const patientCase = CASES.find(c => c.caseId === b.caseId)
    if (!patientCase) throw new HttpError(404, 'Patient case not found.')

    const history = Array.isArray(b.history) ? b.history : []

    // ── Try the Groq AI first ────────────────────────────────────────────────
    if (GROQ_API_KEY) {
      try {
        const reply = await callGroq(patientCase, b.message, history)
        return send(res, 200, { reply })
      } catch (err) {
        // Log but don't crash — fall through to the static fallback below
        console.error('[chat] Groq error:', err.message)
      }
    }

    // ── Static fallback (no Groq key, or Groq failed) ────────────────────────
    const usedAnswers = new Set(
      history.filter(t => t.role === 'patient').map(t => t.text)
    )
    const words = b.message.toLowerCase().split(/\W+/).filter(Boolean)
    const scored = patientCase.questions
      .map((q, idx) => {
        const matchCount = words.filter(w =>
          q.prompt.toLowerCase().split(/\W+/).includes(w)
        ).length
        return { q, matchCount }
      })
      .filter(s => !usedAnswers.has(s.q.answer))
      .sort((a, b) => b.matchCount - a.matchCount)

    const doctorTurns = history.filter(t => t.role === 'doctor').length - 1
    const fallback =
      patientCase.questions.find(q => !usedAnswers.has(q.answer)) ??
      patientCase.questions[
        Math.max(0, doctorTurns) % patientCase.questions.length
      ]
    const chosen = (scored[0]?.matchCount ?? 0) > 0 ? scored[0].q : fallback

    return send(res, 200, {
      reply: chosen?.answer ?? "I'm not sure about that."
    })
  }

  throw new HttpError(404, 'Not found.')
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
}
const CSP =
  "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url)
    let file = normalize(
      join(FRONTEND, url.pathname === '/' ? 'index.html' : url.pathname)
    )
    if (!file.startsWith(FRONTEND) || !existsSync(file))
      throw new HttpError(404, 'Not found.')
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] || 'application/octet-stream',
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff'
    })
    res.end(readFileSync(file))
  } catch (err) {
    if (err instanceof HttpError)
      return send(res, err.status, { error: { message: err.message } })
    console.error(err)
    send(res, 500, { error: { message: 'Something went wrong on our side.' } })
  }
})
server.listen(PORT, () =>
  console.log(
    `Clinic dev server (no MongoDB) on http://localhost:${PORT}  serving ${FRONTEND}`
  )
)

// Give a clear human-readable message when the port is already in use,
// instead of the raw Node EADDRINUSE stack trace.
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌  Port ${PORT} is already in use.\n`)
    console.error(`   Another server is running on that port. Options:\n`)
    console.error(`   1. Stop the other server first, then run:  npm run dev`)
    console.error(`   2. Use a different port:  PORT=4001 npm run dev\n`)
    process.exit(1)
  }
  throw err
})
