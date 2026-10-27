import { Router } from 'express';
import type { Config } from '../config.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/errors.js';
import { toPublicCase } from '../lib/publicCase.js';
import { requireAuth } from '../middleware/auth.js';
import { ConsultationModel } from '../models/Consultation.js';
import { PatientCaseModel } from '../models/PatientCase.js';

/**
 * Cases are sent without points, feedback or the educational note, so the answer key never
 * reaches the browser before the player has chosen. Those come back from POST /api/consultations.
 */
export function casesRouter(config: Config): Router {
  const router = Router();
  router.use(requireAuth(config));

  // The next patient for this player: cases rotate in order, one per finished consultation.
  router.get(
    '/next',
    asyncHandler(async (req, res) => {
      const cases = await PatientCaseModel.find({ active: true }).sort({ order: 1 }).lean();
      if (cases.length === 0) throw new HttpError(503, 'No patient cases are available.');
      const done = await ConsultationModel.countDocuments({ userId: req.user!._id });
      res.json({ case: toPublicCase(cases[done % cases.length]) });
    }),
  );

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const cases = await PatientCaseModel.find({ active: true }).sort({ order: 1 }).lean();
      res.json({ cases: cases.map(toPublicCase) });
    }),
  );
  return router;
}
