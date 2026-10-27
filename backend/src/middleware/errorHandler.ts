import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from '../lib/errors.js';

export const notFound: RequestHandler = (_req, _res, next) => next(new HttpError(404, 'Not found.'));

/** One JSON error shape for everything. Internal errors are logged, never leaked. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { message: err.message, details: err.details } });
    return;
  }
  const type = (err as { type?: string }).type;
  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: { message: 'Request body is not valid JSON.' } });
    return;
  }
  if (type === 'entity.too.large') {
    res.status(413).json({ error: { message: 'Request body is too large.' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { message: 'Something went wrong on our side.' } });
};
