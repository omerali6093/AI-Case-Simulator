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

// ── Zod validation ────────────────────────────────────────────────────────────

const TurnSchema = z.object({
  role: z.enum(['doctor', 'patient']),
  text: z.string().max(500),
});

const ChatBodySchema = z.object({
  caseId: z.string().min(1).max(100),
  message: z.string().min(1, 'Message cannot be empty.').max(500, 'Message is too long.'),
  history: z.array(TurnSchema).max(40).default([]),
});

// ── Per-user rate limiter (prevents Groq quota abuse) ─────────────────────────

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 30,
  keyGenerator: (req) => String(req.user?._id ?? req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many questions — please slow down.' } },
});

// ── Router factory ────────────────────────────────────────────────────────────

export function chatRouter(config: Config): Router {
  const router = Router();

  router.use(requireAuth(config));
  router.use(chatLimiter);

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      // Validate body
      const parsed = ChatBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request.');
      }
      const { caseId, message, history } = parsed.data;

      // Look up the case
      const patientCase = await PatientCaseModel.findOne({ caseId, active: true }).lean();
      if (!patientCase) throw new HttpError(404, 'Case not found.');

      // Require Groq API key
      if (!config.GROQ_API_KEY) {
        throw new HttpError(503, 'AI chat is not configured on this server.');
      }

      const groq = getGroqClient(config.GROQ_API_KEY);
      const systemPrompt = buildSystemPrompt(patientCase);

      // Build the OpenAI-compatible message array
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
        // Inject any prior turns so the patient remembers context
        ...history.map((turn) => ({
          role: turn.role === 'doctor' ? ('user' as const) : ('assistant' as const),
          content: turn.text,
        })),
        // The new doctor question
        { role: 'user', content: message },
      ];

      const completion = await groq.chat.completions.create({
        model: 'qwen/qwen3.8-27b',
        messages,
        max_tokens: 150,   // keeps replies short for speech bubbles
        temperature: 0.7,
      });

      const raw = completion.choices[0]?.message?.content ?? "I'm sorry, I couldn't understand that.";
      // Strip any <think>…</think> reasoning blocks that some models include
      const reply = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || "I'm sorry, I couldn't understand that.";

      res.json({ reply });
    }),
  );

  return router;
}
