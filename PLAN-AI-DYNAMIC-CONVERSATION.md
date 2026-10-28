# Plan: AI-Powered Dynamic Patient Conversation

## Problem Statement

The current consultation flow presents the doctor with 4 pre-scripted questions they can only click through in order. The doctor has no agency — the conversation is fully on rails. This feature replaces that with a real free-form chat: the doctor types any question into an input box, the AI responds as the patient in character, and the experience becomes an actual clinical reasoning exercise.

---

## Requirements

- Doctor gets a text input box during the `asking` phase to type any question freely
- AI responds as the patient, staying in character (name, age, symptoms, personality defined by the case)
- AI is powered by **Groq's free LLM API** (`groq-sdk` is already installed in the backend)
- The backend proxies all Groq calls (API key stays server-side, never exposed to the browser)
- Questioning ends when the doctor clicks a **"Done — Review notes"** button (doctor-controlled)
- The conversation history (what was actually typed) replaces the old static Q&A in the Notes modal
- Demo/offline mode falls back to the existing static pre-written answers so it works without a server
- The scoring/submission phase (`deciding` → `result`) remains unchanged

---

## Background: Existing Architecture

### Tech Stack
- **Backend:** Node.js 20+, Express 4, TypeScript, MongoDB/Mongoose, Zod, JWT cookies
- **Frontend:** React 19, Vite, TypeScript, plain CSS — no state management library
- **AI SDK:** `groq-sdk ^1.6.0` is already in `backend/package.json` but has zero wiring yet

### Current Consultation Flow (phases)

```
auth → arriving → asking → talking → review → deciding → reacting → result
```

- `asking`: Tray shows the next pre-written question as a button. Doctor clicks "Ask".
- `talking`: `askNext()` runs `say('doctor', q.prompt)` then `say('patient', q.answer)` — both static strings. Repeats 4 times.
- `review`: Doctor opens Notes modal, sees all 4 Q&As, then moves to `deciding`.

### What Changes vs. What Stays the Same

| Area | Change |
|---|---|
| `asking` / `talking` phases | Replaced with free-form chat input + AI response |
| `Tray.tsx` (asking phase) | Input box + Send button replaces the static "Ask" button |
| `App.tsx` → `askNext()` | Replaced with `sendQuestion(text)` that calls the new API |
| `api.ts` | New `chat(caseId, turn, history)` method added |
| `backend/src/routes/` | New `/api/chat` route added |
| Notes modal | Shows actual conversation history instead of static Q&As |
| `types.ts` | New `ChatTurn` type; `PatientCase.qs` no longer needed on client |
| Demo mode | Falls back to static Q&A answers (Groq not called) |
| Scoring, submission, result | **Unchanged** |
| Auth, progress, 3D world | **Unchanged** |

---

## Proposed Solution

### Architecture Flow

```
Doctor types question
        ↓
Frontend: sendQuestion(text)
        ↓
POST /api/chat  { caseId, message, history[] }
        ↓
Backend: load PatientCase from MongoDB
        ↓
Backend: build system prompt (patient persona)
        ↓
Groq API: groq.chat.completions.create(...)
        ↓
Backend returns: { reply: "..." }
        ↓
Frontend: say('patient', reply) → typewriter animation
```

### System Prompt Design

The Groq call uses a crafted system prompt that:
1. Defines the patient's name, age, and presenting complaint
2. Lists the key symptoms and history the patient "knows" (from `educationalNote` and `complaint`)
3. Instructs the AI to stay in character as a patient (not a doctor), answer only what was asked, show appropriate emotion, and never give a diagnosis
4. Keeps responses short (1–3 sentences) to fit the speech bubble UI

### New `ChatTurn` Type

```typescript
interface ChatTurn {
  role: 'doctor' | 'patient'
  text: string
}
```

The frontend keeps the history array in state. Each call to `/api/chat` sends the full history so the AI has context. History is also what populates the Notes modal.

### Input Box UI (asking phase)

- A `<textarea>` (auto-resize) with placeholder "Ask the patient a question…"
- **Send** button — disabled while waiting for AI response or when input is empty
- Turn counter: "Asked 3 questions so far"
- **"Done — Review notes"** button — always visible, ends the questioning phase
- Pressing `Enter` (without Shift) submits the question

---

## Task Breakdown

### Task 1: Add `GROQ_API_KEY` to backend config and create the Groq client utility

**Objective:** Wire the already-installed `groq-sdk` into the backend with proper config validation.

**Implementation:**
- Add `GROQ_API_KEY: z.string().min(1)` to `backend/src/config.ts` schema
- Add `GROQ_API_KEY=` to `backend/.env.example`
- Create `backend/src/lib/groqClient.ts` — exports a factory `createGroqClient(apiKey)` that returns a configured `Groq` instance
- Create `backend/src/lib/patientPrompt.ts` — exports `buildSystemPrompt(patientCase)` that constructs the character prompt from case fields

**Test:** Unit test that `buildSystemPrompt` returns a non-empty string containing the patient's name and complaint.

**Demo:** Config loads cleanly; unit test passes.

---

### Task 2: Create the `/api/chat` backend route

**Objective:** A new authenticated endpoint that accepts a doctor's message + conversation history and returns an AI patient response.

**Implementation:**
- Create `backend/src/routes/chat.ts`
- `POST /api/chat` — body: `{ caseId: string, message: string, history: { role: 'doctor'|'patient', text: string }[] }`
- Zod validation: `message` max 500 chars, `history` max 20 turns, each turn text max 500 chars
- Looks up `PatientCaseModel.findOne({ caseId, active: true })`
- Calls `groq.chat.completions.create` with the system prompt + history formatted as OpenAI-style messages
- Returns `{ reply: string }`
- Add the route to `backend/src/app.ts` as `app.use('/api/chat', chatRouter(config))`
- Add a dedicated rate limiter (30 req/min per user) to prevent Groq quota abuse

**Test:** Integration test using `mongodb-memory-server` + a mocked Groq client. Verify: auth required, caseId not found → 404, happy path → 200 with `reply`.

**Demo:** `curl -X POST /api/chat` with a valid session returns a patient reply string.

---

### Task 3: Add `ChatTurn` type and `chat()` method to the frontend API client

**Objective:** Give the frontend a typed way to call the new backend route.

**Implementation:**
- Add `ChatTurn` interface to `frontend/src/types.ts`
- Add `chat(caseId, message, history) => Promise<{ reply: string }>` to the `ClinicAPI` interface
- Implement in `api.ts` `remote` object: `POST /api/chat`
- Implement in `api.ts` `demo` object: cycles through the case's static `questions` array by turn count, returns the matching static `answer` as the reply (offline fallback)

**Test:** Demo mode fallback is fully testable without a backend — verify it returns a string reply.

**Demo:** `clinicAPI.chat('case-cold', 'How are you?', [])` returns a reply in both remote and demo modes.

---

### Task 4: Replace the static `askNext()` flow in `App.tsx` with `sendQuestion()`

**Objective:** Wire the new chat API into the game's phase machine so the doctor types freely and the AI responds via the existing typewriter animation.

**Implementation:**
- Add state: `chatHistory: ChatTurn[]`, `chatBusy: boolean`
- Remove `askNext()` function
- Add `sendQuestion(text: string)` async function:
  1. Appends `{ role: 'doctor', text }` to history
  2. Sets `chatBusy = true`, phase → `'talking'`
  3. Calls `say('doctor', text)` — typewriter for the doctor's line
  4. Calls `clinicAPI.chat(caseId, text, history)`
  5. Appends `{ role: 'patient', reply }` to history
  6. Calls `say('patient', reply)` — typewriter for the patient's line
  7. Sets `chatBusy = false`, phase → `'asking'`
- Add `endQuestioning()` function: sets phase → `'review'`
- Keep `begin()` unchanged — patient still says their opening complaint line

**Test:** Manually verify typewriter fires for both lines; `chatBusy` disables Send during loading.

**Demo:** Doctor types "Do you have a fever?" → doctor bubble animates → patient bubble animates with AI reply → input clears and is ready for next question.

---

### Task 5: Replace the static Tray UI with the free-form chat input

**Objective:** Update `Tray.tsx` so the `asking` phase renders the new input instead of the old question button.

**Implementation:**
- Remove the old `asking` branch (static question button + progress dots)
- Add new `asking` branch with:
  - `<textarea>` (auto-resize, max ~3 lines) with placeholder "Ask the patient a question…"
  - **Send** button — disabled when `chatBusy` or input is empty
  - Turn counter: `"Asked {turnCount} question(s) so far"`
  - **"Done — Review notes"** button (secondary style) — calls `onEndQuestioning`
  - `onKeyDown`: pressing `Enter` (without Shift) submits
- Update `Tray` props interface: add `onSendQuestion`, `onEndQuestioning`, `chatBusy`, `chatInput`, `onInputChange`, `turnCount`
- Wire all new props from `App.tsx`

**Test:** Keyboard `Enter` submits; `Shift+Enter` adds newline; Send button disabled when busy; "Done" button accessible by keyboard.

**Demo:** Full interaction loop works — type question, hit Enter or Send, see both bubbles animate, repeat, then hit "Done".

---

### Task 6: Update the Notes modal to show the actual conversation history

**Objective:** The Notes modal currently renders 4 static Q&A pairs. Replace this with the live `chatHistory` array.

**Implementation:**
- Pass `chatHistory: ChatTurn[]` prop down to `NotesModal` (via `Modal` → `NotesModal`)
- Replace static Q&A list with a chat-log style list rendered from `chatHistory`
- Doctor turns styled as "You: …", patient turns styled as "Patient: …"
- If `chatHistory` is empty, show the opening complaint as the first patient message
- Keep the "Choose a next step" button logic unchanged

**Test:** Open notes mid-conversation — only turns so far shown. Open after "Done" — full history shown.

**Demo:** Notes modal shows a readable transcript of the real doctor–patient conversation.

---

### Task 7: End-to-end integration and cleanup

**Objective:** Verify the full flow works together, clean up removed static code, confirm demo mode still works offline.

**Implementation:**
- Remove `QUESTIONS_PER_CASE` constant from `utils.ts`
- Remove `qs` field from the frontend `PatientCase` type (keep in `DemoCase` for demo fallback only)
- Update `api.ts` demo `nextCase()` to keep `qs` internally for the demo chat fallback
- Confirm `backend/src/routes/cases.ts` `toPublicCase()` already omits `questions` (it does)
- Run existing backend test suite (`npm test`) — confirm no regressions
- Full manual E2E smoke test: login → new case → chat 3 questions → Done → pick step → confirm → result modal

**Demo:** Complete game loop works from auth screen to result screen using the AI-powered free-form conversation.

---

## File Reference Map

```
backend/
  src/
    config.ts              ← Add GROQ_API_KEY (Task 1)
    app.ts                 ← Register /api/chat route (Task 2)
    lib/
      groqClient.ts        ← NEW: Groq SDK factory (Task 1)
      patientPrompt.ts     ← NEW: System prompt builder (Task 1)
    routes/
      chat.ts              ← NEW: /api/chat endpoint (Task 2)
  .env.example             ← Add GROQ_API_KEY= (Task 1)

frontend/
  src/
    types.ts               ← Add ChatTurn interface (Task 3)
    api.ts                 ← Add chat() method (Task 3)
    App.tsx                ← Replace askNext() with sendQuestion() (Task 4)
    utils.ts               ← Remove QUESTIONS_PER_CASE (Task 7)
    components/
      Tray.tsx             ← Replace asking UI with chat input (Task 5)
      modals/
        NotesModal.tsx     ← Show chatHistory instead of static qs (Task 6)
```

---

## Getting Started

1. Get a free Groq API key from [console.groq.com](https://console.groq.com)
2. Add it to `backend/.env`: `GROQ_API_KEY=your_key_here`
3. Implement tasks in order — each task is a working, demoable increment
4. Run `npm test` in the backend after Task 2 to verify the route integration test passes
