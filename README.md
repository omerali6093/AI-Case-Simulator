# Clinic Simulator (full stack)

An educational 3D clinic game: you are the doctor. A fictional patient walks in, sits opposite you and speaks in a bubble above their head. You ask four questions, read the notes, choose a next step and get feedback and a score. **All patients are fictional; four questions never give a real-world diagnosis.**

```
frontend-react/  The game — React + TypeScript + Vite. Replaces the old plain-HTML frontend.
backend/         Node + Express + MongoDB API.
e2e/             Browser test of the whole flow.
```

## Run it

### Development (recommended)

Open two terminals:

**Terminal 1 — backend:**
```bash
cd backend
cp .env.example .env        # set JWT_SECRET (32+ chars) and MONGODB_URI; CLIENT_ORIGIN defaults to http://localhost:5173
npm install
npm run dev                 # Express on http://localhost:4000
```

**Terminal 2 — frontend:**
```bash
cd frontend-react
npm install                 # already done if you cloned fresh
npm run dev                 # Vite on http://localhost:5173, proxies /api → :4000
```

Then open **http://localhost:5173**.

The Vite dev server proxies `/api` requests to `:4000`, so page and API share one origin in development — httpOnly cookies work without any CORS config.

### Fastest, nothing to install (Node 20+)

An in-memory dev server with the same API, stored in a JSON file instead of MongoDB:
```bash
node backend/dev/memory-server.mjs      # then open http://localhost:4000
```

This serves the built frontend from `../frontend-dist`. Run `cd frontend-react && npm run build` first to generate it, or open the React app separately with `npm run dev`.

### Build for production

```bash
cd frontend-react
npm run build               # outputs to ../frontend-dist
```

Then start the backend — it serves `../frontend-dist` as static files so everything runs from one origin:
```bash
cd backend
npm start                   # reads FRONTEND_DIR=../frontend-dist from .env
```

## How it works

- **Sign-in gate** in front of the game (register / sign in). The server sets an httpOnly session cookie; the page never sees a token.
- **Server decides everything that counts.** `GET /api/cases/next` sends the next patient (dialogue and choices, no points or feedback). `POST /api/consultations` takes only `caseId`, `stepId` and a request id; the server picks the score, stores the record and recalculates progress and level. Extra fields such as `score` are rejected.
- **Safe retries.** If the connection drops after the server saved a result, the browser retries with the same request id and gets the saved record back instead of scoring twice.
- **Progression.** Cases rotate per player (one more per finished consultation); a level every 250 points; history and progress come from the server.
- **Offline demo.** With no server reachable the app auto-switches to a local demo mode — any username, scoring and records kept in the browser.
- **Security.** bcrypt (cost 12), httpOnly SameSite cookie, logout revokes the token server-side, strict Zod validation, Helmet + CSP, CORS locked to `CLIENT_ORIGIN`, Origin check on writes, rate limits, 10 kb body limit, same error for wrong password and unknown user.
- **Older GPUs.** Pixel-ratio cap, Performance setting without shadows/glow, automatic downgrade when frame rate drops, generated textures (nothing to download), and a no-3D fallback.

## Backend API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | No | Create account, set cookie |
| POST | `/api/auth/login` | No | Authenticate, set cookie |
| GET  | `/api/auth/me` | Yes | Current session info |
| POST | `/api/auth/logout` | No | Revoke token, clear cookie |
| GET  | `/api/cases/next` | Yes | Next case (answer key stripped) |
| GET  | `/api/cases` | Yes | All active cases |
| POST | `/api/consultations` | Yes | Submit step, server scores it |
| GET  | `/api/consultations` | Yes | User history, paginated |
| GET  | `/api/progress` | Yes | Points, level, stats |
| GET  | `/api/health` | No | `{ ok: true }` |

## Testing

```bash
cd backend && npm test       # API unit tests (in-memory MongoDB)
```

Keep demo data in sync after editing cases: `cd backend && npm run sync:demo` then copy the output into `frontend-react/src/demoData.ts`.
