import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/auth';
import { AppError } from './app-error';

export function requireUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  }

  return req.user;
}
