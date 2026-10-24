import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { AppError } from '../utils/app-error';
import { failure } from '../utils/api-response';
import { logger } from '../utils/logger';

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    if (error.statusCode >= 500 && error.code !== 'NOT_IMPLEMENTED') {
      logger.error(error.message, {
        code: error.code,
        path: req.path,
        method: req.method,
      });
    }

    res.status(error.statusCode).json(failure(error.code, error.message, error.details));
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json(failure('VALIDATION_ERROR', 'Invalid request', error.flatten()));
    return;
  }

  const message = error instanceof Error ? error.message : 'Unexpected error';
  logger.error('Unhandled error', { error, path: req.path, method: req.method });

  const publicMessage = env.NODE_ENV === 'production' ? 'Internal server error' : message;
  res.status(500).json(failure('INTERNAL_ERROR', publicMessage));
}
