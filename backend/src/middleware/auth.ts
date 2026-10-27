import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { UserModel, type UserDoc } from '../models/User.js';

export const COOKIE_NAME = 'clinic_session';
const SESSION_DAYS = 7;

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserDoc;
  }
}

interface SessionPayload {
  sub: string;
  tv: number;
}

export function issueSession(res: Response, config: Config, user: { _id: unknown; tokenVersion: number }): void {
  const token = jwt.sign({ sub: String(user._id), tv: user.tokenVersion } satisfies SessionPayload, config.JWT_SECRET, {
    expiresIn: `${SESSION_DAYS}d`,
    algorithm: 'HS256',
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.COOKIE_SAMESITE,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSession(res: Response, config: Config): void {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: config.cookieSecure, sameSite: config.COOKIE_SAMESITE, path: '/' });
}

/** Resolves the logged-in user from the cookie, or returns null for a missing/invalid/revoked session. */
export async function userFromRequest(req: Request, config: Config): Promise<UserDoc | null> {
  const token = req.cookies?.[COOKIE_NAME];
  if (typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as SessionPayload;
    const user = await UserModel.findById(payload.sub).lean<UserDoc>();
    if (!user || user.tokenVersion !== payload.tv) return null;
    return user;
  } catch {
    return null;
  }
}

export function requireAuth(config: Config): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = await userFromRequest(req, config);
      if (!user) throw new HttpError(401, 'Please sign in.');
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}
