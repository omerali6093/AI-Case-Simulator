import { Router } from 'express';
import type { Config } from '../config.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { recomputeProgress } from '../models/Progress.js';

export function progressRouter(config: Config): Router {
  const router = Router();
  router.get(
    '/',
    requireAuth(config),
    asyncHandler(async (req, res) => {
      res.json({ progress: await recomputeProgress(req.user!._id) });
    }),
  );
  return router;
}
