import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Config } from '../config.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/errors.js';
import { getGroqClient } from '../lib/groqClient.js';
import { buildSystemPrompt } from '../lib/patientPrompt.js';
import { requireAuth } from '../middleware/auth.js';
import { PatientCaseModel } from '../models/PatientCase.js';

// ─── Config ───────────────────────────────────────────────────────────────────

/** Groq model to use. Swap here if Groq deprecates it. */
const GROQ_MODEL = 'qwen/qwen3.8-27b';

/** Max tokens in the patient's reply — keeps it short for speech bubbles. */
const MAX_REPLY_TOKENS = 150;

/** How many ms to wait for the Groq API before giving up. */
const GROQ_TIMEOUT_MS = 15_000;

// ─── Input validation ─────────────────────────────────────────────────────────

const TurnSchema = z.object({
  role: z.enum(['doctor', 'patient']),
  text: z.string().max(500),
});

const ChatBodySchema = z.object({
  caseId  : z.string().min(1).max(100),
  message : z.string().min(1, 'Message cannot be empty.').max(500, 'Message is too long.'),
  // Full conversation so far — the AI needs context to give coherent replies.
  // Cap at 40 turns (20 exchanges) to keep the prompt size manageable.
  history : z.array(TurnSchema).max(40).default([]),
});

// ─── Per-user rate limiter ────────────────────────────────────────────────────
// Prevents a single user from hammering the Groq quota.

const chatLimiter = rateLimit({
  windowMs      : 60 * 1_000,   // 1-minute window
  max           : 30,           // 30 requests per minute per user
  keyGenerator  : (req) => String(req.user?._id ?? req.ip),
  standardHeaders: true,
  legacyHeaders : false,
  message       : { error: { message: 'Too many questions — please slow down a little.' } },
});

// ─── Helper: strip model reasoning tags ───────────────────────────────────────
// Some models (Qwen, etc.) wrap their internal reasoning in <think>…</think>.
// We strip that before sending the reply to the browser.

function stripReasoningTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')  // remove <think> blocks
    .replace(/^\s+|\s+$/g, '')                  // trim whitespace
    || "I'm not sure how to answer that.";
}

// ─── Helper: build the message array for the Groq API ────────────────────────
// Maps our internal { role, text } history to OpenAI-style { role, content }.

type GroqMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function buildMessages(
  systemPrompt : string,
  history      : Array<{ role: 'doctor' | 'patient'; text: string }>,
  newMessage   : string,
): GroqMessage[] {
  return [
    // 1. System prompt — defines who the patient is
    { role: 'system', content: systemPrompt },

    // 2. Prior turns — gives the AI memory of the conversation so far
    ...history.map((turn): GroqMessage => ({
      role    : turn.role === 'doctor' ? 'user' : 'assistant',
      content : turn.text,
    })),

    // 3. The new doctor question
    { role: 'user', content: newMessage },
  ];
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function chatRouter(config: Config): Router {
  const router = Router();

  // Every /api/chat request must be from a logged-in user
  router.use(requireAuth(config));

  // Apply per-user rate limiting
  router.use(chatLimiter);

  /**
   * POST /api/chat
   *
   * Body: { caseId: string, message: string, history: ChatTurn[] }
   *
   * Returns: { reply: string }
   *
   * The frontend sends the doctor's typed question plus the full conversation
   * history. The backend builds a patient-persona prompt, calls Groq, and
   * returns the patient's reply as a plain string.
   */
  router.post(
    '/',
    asyncHandler(async (req, res) => {

      // ── 1. Validate the request body ──────────────────────────────────────
      const parsed = ChatBodySchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.issues[0]?.message ?? 'Invalid request.';
        throw new HttpError(400, firstError);
      }
      const { caseId, message, history } = parsed.data;

      // ── 2. Load the patient case from the database ────────────────────────
      const patientCase = await PatientCaseModel.findOne({ caseId, active: true }).lean();
      if (!patientCase) {
        throw new HttpError(404, 'Patient case not found.');
      }

      // ── 3. Check the Groq API key is configured ───────────────────────────
      if (!config.GROQ_API_KEY) {
        throw new HttpError(503, 'AI chat is not available on this server — GROQ_API_KEY is not set.');
      }

      // ── 4. Build the system prompt and the message array ──────────────────
      const groq          = getGroqClient(config.GROQ_API_KEY);
      const systemPrompt  = buildSystemPrompt(patientCase);
      const messages      = buildMessages(systemPrompt, history, message);

      // ── 5. Call Groq with a timeout ───────────────────────────────────────
      // We race the Groq call against a timeout so a slow model never hangs
      // the request indefinitely.
      const groqCallPromise = groq.chat.completions.create({
        model       : GROQ_MODEL,
        messages,
        max_tokens  : MAX_REPLY_TOKENS,
        temperature : 0.7,   // some variation so the patient doesn't sound robotic
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new HttpError(504, 'The patient took too long to respond. Please try again.')), GROQ_TIMEOUT_MS)
      );

      const completion = await Promise.race([groqCallPromise, timeoutPromise]);

      // ── 6. Extract and clean the reply ────────────────────────────────────
      const rawReply = completion.choices[0]?.message?.content ?? '';
      const reply    = stripReasoningTags(rawReply);

      // ── 7. Return the patient's reply to the frontend ─────────────────────
      res.json({ reply });
    }),
  );

  return router;
}
