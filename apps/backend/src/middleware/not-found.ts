import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/app-error';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('NOT_FOUND', `Route ${req.method} ${req.path} not found`, 404));
}
