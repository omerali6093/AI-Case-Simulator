import { Router } from 'express';
import { z } from 'zod';
import type { Config } from '../config.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/errors.js';
import { MAX_SCORE, findStep } from '../lib/scoring.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ConsultationModel } from '../models/Consultation.js';
import { PatientCaseModel } from '../models/PatientCase.js';
import { recomputeProgress } from '../models/Progress.js';

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Invalid id.');

// Note: no score field. The server computes it; anything extra the client sends is rejected.
const submitBody = z.object({ caseId: id, stepId: id, clientId: z.string().min(8).max(64).regex(/^[A-Za-z0-9-]+$/, 'Invalid id.') }).strict();
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

interface RecordShape {
  _id: unknown;
  caseId: string;
  caseTitle: string;
  patientName: string;
  stepId: string;
  stepLabel: string;
  score: number;
  maxScore: number;
  feedback: string;
  educationalNote: string;
  completedAt: Date;
}

function toRecord(doc: RecordShape, username: string) {
  return {
    id: String(doc._id),
    username,
    caseId: doc.caseId,
    caseTitle: doc.caseTitle,
    patientName: doc.patientName,
    stepId: doc.stepId,
    stepLabel: doc.stepLabel,
    score: doc.score,
    maxScore: doc.maxScore,
    feedback: doc.feedback,
    educationalNote: doc.educationalNote,
    completedAt: doc.completedAt.toISOString(),
  };
}

export function consultationsRouter(config: Config): Router {
  const router = Router();
  router.use(requireAuth(config));

  router.post(
    '/',
    validate(submitBody),
    asyncHandler(async (req, res) => {
      const user = req.user!;
      const { caseId, stepId, clientId } = req.body as z.infer<typeof submitBody>;

      const existing = await ConsultationModel.findOne({ userId: user._id, clientId }).lean();
      if (existing) {
        // A retried request: return what was already saved, never score twice.
        if (existing.caseId !== caseId || existing.stepId !== stepId) {
          throw new HttpError(409, 'That request id was already used for a different consultation.');
        }
        res.status(200).json({ record: toRecord(existing, user.username), progress: await recomputeProgress(user._id) });
        return;
      }

      const patientCase = await PatientCaseModel.findOne({ caseId, active: true }).lean();
      if (!patientCase) throw new HttpError(404, 'Unknown patient case.');
      const step = findStep(patientCase.steps, stepId);
      if (!step) throw new HttpError(400, 'Unknown next step for this case.');

      let saved;
      try {
        saved = await ConsultationModel.create({
          userId: user._id,
          clientId,
          caseId: patientCase.caseId,
          caseTitle: patientCase.title,
          patientName: patientCase.patientName,
          stepId: step.id,
          stepLabel: step.label,
          score: step.points,
          maxScore: MAX_SCORE,
          feedback: step.feedback,
          educationalNote: patientCase.educationalNote,
        });
      } catch (err) {
        // Two identical requests raced; the unique index let only one through.
        if ((err as { code?: number }).code === 11000) {
          const winner = await ConsultationModel.findOne({ userId: user._id, clientId }).lean();
          if (winner) {
            res.status(200).json({ record: toRecord(winner, user.username), progress: await recomputeProgress(user._id) });
            return;
          }
        }
        throw err;
      }
      res.status(201).json({ record: toRecord(saved, user.username), progress: await recomputeProgress(user._id) });
    }),
  );

  router.get(
    '/',
    validate(listQuery, 'query'),
    asyncHandler(async (req, res) => {
      const user = req.user!;
      const { limit, page } = req.query as unknown as z.infer<typeof listQuery>;
      // Always filtered by the signed-in user, so one player can never read another's history.
      const docs = await ConsultationModel.find({ userId: user._id })
        .sort({ completedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      res.json({ records: docs.map((d) => toRecord(d, user.username)), page, limit });
    }),
  );

  return router;
}
