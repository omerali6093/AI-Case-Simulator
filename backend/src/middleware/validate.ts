import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { HttpError } from '../lib/errors.js';

type Source = 'body' | 'query';

/** Parses with zod and replaces the input with the cleaned result. Unknown keys are dropped. */
export function validate<S extends ZodTypeAny>(schema: S, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(new HttpError(400, details[0]?.message ?? 'Invalid request.', details));
    }
    (req as unknown as Record<string, unknown>)[source] = result.data as z.infer<S>;
    next();
  };
}
