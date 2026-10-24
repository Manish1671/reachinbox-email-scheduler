import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { JwtPayload } from '../types/auth';
import { AppError } from './app-error';

export function signAccessToken(userId: string): string {
  const payload: JwtPayload = { sub: userId };
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };

  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (typeof decoded !== 'object' || decoded === null || typeof decoded.sub !== 'string') {
      throw new AppError('UNAUTHORIZED', 'Invalid access token', 401);
    }

    return { sub: decoded.sub };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('TOKEN_EXPIRED', 'Access token expired', 401);
    }

    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError('UNAUTHORIZED', 'Invalid access token', 401);
    }

    throw new AppError('UNAUTHORIZED', 'Invalid or expired access token', 401);
  }
}

export function getUserIdFromToken(token: string): string {
  return verifyAccessToken(token).sub;
}
