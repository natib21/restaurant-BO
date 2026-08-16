import type { Response } from 'express';

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>
) {
  res.status(statusCode).json({
    status: 'success',
    ...meta,
    data,
  });
}

export function sendSuccessList<T>(res: Response, key: string, items: T[], statusCode = 200) {
  res.status(statusCode).json({
    status: 'success',
    results: items.length,
    data: { [key]: items },
  });
}
