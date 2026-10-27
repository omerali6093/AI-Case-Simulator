// Dependency-free dev server: same HTTP contract as the Express + MongoDB backend, stored in a
// JSON file instead of MongoDB, and no npm install needed (Node 20+). Use it to try the game
// quickly:   node dev/memory-server.mjs     then open http://localhost:4000
// It is for development and demos only. Production uses src/ (Express + MongoDB).
import { createServer } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const FRONTEND = resolve(process.env.FRONTEND_DIR || join(here, '../../frontend'));
const DATA_FILE = process.env.DATA_FILE || join(here, '.dev-data.json');
const AUTH_MAX = Number(process.env.AUTH_MAX || 10);
const CASES = JSON.parse(readFileSync(join(here, '../src/seed/cases.data.json'), 'utf8')).sort((a, b) => a.order - b.order);

let db = { users: [], consultations: [] };
if (DATA_FILE !== ':memory:' && existsSync(DATA_FILE)) {
  try { db = JSON.parse(readFileSync(DATA_FILE, 'utf8')); } catch { /* start fresh */ }
}
const save = () => { if (DATA_FILE !== ':memory:') writeFileSync(DATA_FILE, JSON.stringify(db)); };
const sessions = new Map(); // token -> userId
const attempts = new Map(); // ip -> { n, reset }

const hash = (pw, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;
const verify = (pw, stored) => {
  const [salt, h] = stored.split(':');
  return timingSafeEqual(Buffer.from(h, 'hex'), scryptSync(pw, salt, 32));
};
const DUMMY = hash('not-a-real-password');

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const summarise = (total, n) => ({ totalPoints: total, level: 1 + Math.floor(total / 250), completed: n, averageScore: n ? Math.round((total / n) * 10) / 10 : 0 });
const progressOf = (u) => { const mine = db.consultations.filter((c) => c.userId === u.id); return summarise(mine.reduce((a, c) => a + c.score, 0), mine.length); };
const publicCase = (c) => ({ id: c.caseId, title: c.title, name: c.patientName, age: c.age, look: c.look, complaint: c.complaint, qs: c.questions, steps: c.steps.map(({ id, label, detail }) => ({ id, label, detail })) });
const record = (c, u) => ({ id: c.id, username: u.username, caseId: c.caseId, caseTitle: c.caseTitle, patientName: c.patientName, stepId: c.stepId, stepLabel: c.stepLabel, score: c.score, maxScore: 100, feedback: c.feedback, educationalNote: c.educationalNote, completedAt: c.completedAt });

const send = (res, status, body, headers = {}) => {
  const json = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(json);
};
const parseCookies = (h = '') => Object.fromEntries(h.split(';').map((p) => p.trim().split('=')).filter((p) => p[0]));
const readBody = (req) => new Promise((ok, fail) => {
  let size = 0; const chunks = [];
  req.on('data', (d) => { size += d.length; if (size > 10_000) { fail(new HttpError(413, 'Request body is too large.')); req.destroy(); } else chunks.push(d); });
  req.on('end', () => { if (!chunks.length) return ok({}); try { ok(JSON.parse(Buffer.concat(chunks).toString())); } catch { fail(new HttpError(400, 'Request body is not valid JSON.')); } });
});
const isStr = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max;

function userFrom(req) {
  const id = sessions.get(parseCookies(req.headers.cookie).clinic_session);
  return id ? db.users.find((u) => u.id === id) : null;
}
const setSession = (res, user) => {
  const token = randomBytes(32).toString('hex'); sessions.set(token, user.id);
  return `clinic_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 86400}`;
};

async function api(req, res, url) {
  const { pathname } = url, method = req.method;
  if (pathname === '/api/health') return send(res, 200, { ok: true });
  if (method !== 'GET') { const o = req.headers.origin; if (o && o !== `http://${req.headers.host}`) throw new HttpError(403, 'Request origin not allowed.'); }

  if (pathname === '/api/auth/register' || pathname === '/api/auth/login') {
    const ip = req.socket.remoteAddress || '?', now = Date.now();
    const a = attempts.get(ip) && attempts.get(ip).reset > now ? attempts.get(ip) : { n: 0, reset: now + 15 * 60_000 };
    attempts.set(ip, a); if (++a.n > AUTH_MAX) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    const b = await readBody(req);
    if (Object.keys(b).some((k) => k !== 'username' && k !== 'password')) throw new HttpError(400, 'Unexpected field.');
    if (pathname.endsWith('register')) {
      if (!isStr(b.username, 3, 24)) throw new HttpError(400, 'Username must be 3-24 characters.');
      if (!/^[A-Za-z0-9_]+$/.test(b.username)) throw new HttpError(400, 'Use letters, numbers and underscores only.');
      if (!isStr(b.password, 8, 128)) throw new HttpError(400, 'Password must be at least 8 characters.');
      if (db.users.some((u) => u.key === b.username.toLowerCase())) throw new HttpError(409, 'That doctor name is already taken.');
      const user = { id: randomBytes(8).toString('hex'), username: b.username, key: b.username.toLowerCase(), pw: hash(b.password) };
      db.users.push(user); save();
      return send(res, 201, { user: { username: user.username }, progress: progressOf(user) }, { 'Set-Cookie': setSession(res, user) });
    }
    if (!isStr(b.username, 1, 64) || !isStr(b.password, 1, 128)) throw new HttpError(400, 'Username and password are required.');
    const user = db.users.find((u) => u.key === b.username.trim().toLowerCase());
    const ok = verify(b.password, user ? user.pw : DUMMY);
    if (!user || !ok) throw new HttpError(401, 'Invalid username or password.');
    return send(res, 200, { user: { username: user.username }, progress: progressOf(user) }, { 'Set-Cookie': setSession(res, user) });
  }
  if (pathname === '/api/auth/logout' && method === 'POST') {
    sessions.delete(parseCookies(req.headers.cookie).clinic_session);
    return send(res, 204, undefined, { 'Set-Cookie': 'clinic_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }

  const user = userFrom(req);
  if (!user) throw new HttpError(401, 'Please sign in.');
  if (pathname === '/api/auth/me') return send(res, 200, { user: { username: user.username }, progress: progressOf(user) });
  if (pathname === '/api/progress') return send(res, 200, { progress: progressOf(user) });
  if (pathname === '/api/cases/next') return send(res, 200, { case: publicCase(CASES[db.consultations.filter((c) => c.userId === user.id).length % CASES.length]) });
  if (pathname === '/api/cases') return send(res, 200, { cases: CASES.map(publicCase) });

  if (pathname === '/api/consultations' && method === 'GET') {
    const limit = Number(url.searchParams.get('limit') ?? 50), page = Number(url.searchParams.get('page') ?? 1);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(page) || page < 1) throw new HttpError(400, 'Invalid paging.');
    const mine = db.consultations.filter((c) => c.userId === user.id).sort((a, b) => b.completedAt.localeCompare(a.completedAt) || (b.seq - a.seq));
    return send(res, 200, { records: mine.slice((page - 1) * limit, page * limit).map((c) => record(c, user)), page, limit });
  }
  if (pathname === '/api/consultations' && method === 'POST') {
    const b = await readBody(req);
    if (Object.keys(b).some((k) => !['caseId', 'stepId', 'clientId'].includes(k))) throw new HttpError(400, 'Unexpected field.');
    if (!isStr(b.caseId, 1, 64) || !/^[A-Za-z0-9_-]+$/.test(b.caseId) || !isStr(b.stepId, 1, 64) || !/^[A-Za-z0-9_-]+$/.test(b.stepId) || !isStr(b.clientId, 8, 64) || !/^[A-Za-z0-9-]+$/.test(b.clientId)) throw new HttpError(400, 'Invalid id.');
    const existing = db.consultations.find((c) => c.userId === user.id && c.clientId === b.clientId);
    if (existing) {
      if (existing.caseId !== b.caseId || existing.stepId !== b.stepId) throw new HttpError(409, 'That request id was already used for a different consultation.');
      return send(res, 200, { record: record(existing, user), progress: progressOf(user) });
    }
    const pc = CASES.find((c) => c.caseId === b.caseId); if (!pc) throw new HttpError(404, 'Unknown patient case.');
    const step = pc.steps.find((s) => s.id === b.stepId); if (!step) throw new HttpError(400, 'Unknown next step for this case.');
    const row = { id: randomBytes(8).toString('hex'), seq: db.consultations.length, userId: user.id, clientId: b.clientId, caseId: pc.caseId, caseTitle: pc.title, patientName: pc.patientName, stepId: step.id, stepLabel: step.label, score: step.points, feedback: step.feedback, educationalNote: pc.educationalNote, completedAt: new Date().toISOString() };
    db.consultations.push(row); save();
    return send(res, 201, { record: record(row, user), progress: progressOf(user) });
  }
  throw new HttpError(404, 'Not found.');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const CSP = "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let file = normalize(join(FRONTEND, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(FRONTEND) || !existsSync(file)) throw new HttpError(404, 'Not found.');
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff' });
    res.end(readFileSync(file));
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: { message: err.message } });
    console.error(err); send(res, 500, { error: { message: 'Something went wrong on our side.' } });
  }
});
server.listen(PORT, () => console.log(`Clinic dev server (no MongoDB) on http://localhost:${PORT}  serving ${FRONTEND}`));
export { server };
