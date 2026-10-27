import cors from 'cors';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { Config } from '../config.js';
import { HttpError } from '../lib/errors.js';

export const securityHeaders = () =>
  helmet({
    // The page loads three.js from jsDelivr and fonts from Google; everything else is same-origin.
    // 'unsafe-inline' for styles is needed because the HUD sets inline style attributes; no inline scripts are allowed.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ['https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

export const corsPolicy = (config: Config) =>
  cors({ origin: config.CLIENT_ORIGIN, credentials: true, methods: ['GET', 'POST', 'OPTIONS'], maxAge: 600 });

/**
 * CSRF defence in depth (the cookie is also SameSite): a state-changing request that carries an
 * Origin header must come from the configured web app.
 */
export function originCheck(config: Config) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin && origin !== config.CLIENT_ORIGIN) return next(new HttpError(403, 'Request origin not allowed.'));
    next();
  };
}

const limited = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, message)),
  });

export const generalLimiter = (max = 300) => limited(60_000, max, 'Too many requests. Slow down a little.');
export const authLimiter = (max = 10) => limited(15 * 60_000, max, 'Too many attempts. Try again in a few minutes.');
