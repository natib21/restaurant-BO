import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

const AppError = require('../../../utils/appError');

type RequestPart = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, part: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[part]);
      req[part] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const message = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return next(new AppError(message, 400));
      }
      next(err);
    }
  };
}
