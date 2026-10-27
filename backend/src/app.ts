import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Config } from './config.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { corsPolicy, generalLimiter, originCheck, securityHeaders } from './middleware/security.js';
import { authRouter } from './routes/auth.js';
import { casesRouter } from './routes/cases.js';
import { consultationsRouter } from './routes/consultations.js';
import { progressRouter } from './routes/progress.js';

export interface AppOptions {
  /** Override rate limits (tests use this). */
  generalMax?: number;
  authMax?: number;
}

export function createApp(config: Config, opts: AppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(securityHeaders());
  app.use(corsPolicy(config));
  app.use(generalLimiter(opts.generalMax));
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
  app.use(originCheck(config));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter(config, { authMax: opts.authMax }));
  app.use('/api/cases', casesRouter(config));
  app.use('/api/consultations', consultationsRouter(config));
  app.use('/api/progress', progressRouter(config));
  // Unknown /api paths are JSON 404s, never the static site.
  app.use('/api', notFound);

  // The browser game. The backend serves it so the page and API share one origin (cookies just work).
  const frontend = path.resolve(process.cwd(), config.FRONTEND_DIR);
  if (existsSync(path.join(frontend, 'index.html'))) {
    app.use(express.static(frontend, { index: 'index.html', maxAge: config.NODE_ENV === 'production' ? '1h' : 0 }));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
