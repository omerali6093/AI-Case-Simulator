import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import type { Config } from '../config.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/errors.js';
import { clearSession, issueSession, requireAuth, userFromRequest } from '../middleware/auth.js';
import { authLimiter } from '../middleware/security.js';
import { validate } from '../middleware/validate.js';
import { recomputeProgress } from '../models/Progress.js';
import { UserModel } from '../models/User.js';

const BCRYPT_COST = 12;
// Compared against when the username does not exist, so login time does not reveal which names exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

const username = z
  .string()
  .trim()
  .min(3, 'Username must be 3-24 characters.')
  .max(24, 'Username must be 3-24 characters.')
  .regex(/^[A-Za-z0-9_]+$/, 'Use letters, numbers and underscores only.');
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be 128 characters or fewer.');

const credentials = z.object({ username, password }).strict();
// Login only checks shape, so existing accounts are never locked out by a later rule change.
const loginBody = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(128) }).strict();

export function authRouter(config: Config, opts: { authMax?: number } = {}): Router {
  const router = Router();
  const limiter = authLimiter(opts.authMax);

  router.post(
    '/register',
    limiter,
    validate(credentials),
    asyncHandler(async (req, res) => {
      const { username: name, password: pw } = req.body as z.infer<typeof credentials>;
      const passwordHash = await bcrypt.hash(pw, BCRYPT_COST);
      let user;
      try {
        user = await UserModel.create({ username: name, usernameKey: name.toLowerCase(), passwordHash });
      } catch (err) {
        if ((err as { code?: number }).code === 11000) throw new HttpError(409, 'That doctor name is already taken.');
        throw err;
      }
      issueSession(res, config, user);
      res.status(201).json({ user: { username: user.username }, progress: await recomputeProgress(user._id) });
    }),
  );

  router.post(
    '/login',
    limiter,
    validate(loginBody),
    asyncHandler(async (req, res) => {
      const { username: name, password: pw } = req.body as z.infer<typeof loginBody>;
      const user = await UserModel.findOne({ usernameKey: name.trim().toLowerCase() }).select('+passwordHash');
      const ok = await bcrypt.compare(pw, user?.passwordHash ?? DUMMY_HASH);
      if (!user || !ok) throw new HttpError(401, 'Invalid username or password.');
      issueSession(res, config, user);
      res.json({ user: { username: user.username }, progress: await recomputeProgress(user._id) });
    }),
  );

  router.get(
    '/me',
    requireAuth(config),
    asyncHandler(async (req, res) => {
      const user = req.user!;
      res.json({ user: { username: user.username }, progress: await recomputeProgress(user._id) });
    }),
  );

  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      const user = await userFromRequest(req, config);
      // Bumping the version revokes the token everywhere, not just in this browser.
      if (user) await UserModel.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
      clearSession(res, config);
      res.status(204).end();
    }),
  );

  return router;
}
