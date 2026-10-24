import type { RequestHandler } from 'express';
import { prisma } from '../db/prisma';
import { AppError } from '../utils/app-error';
import { verifyAccessToken } from '../utils/jwt';
import { asyncHandler } from './async-handler';

function readBearerToken(header: string | undefined): string {
  if (!header) {
    throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  }

  const match = /^Bearer\s+(\S+)$/.exec(header);

  if (!match?.[1]) {
    throw new AppError('UNAUTHORIZED', 'Malformed authorization header', 401);
  }

  return match[1];
}

export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = readBearerToken(req.headers.authorization);
  const payload = verifyAccessToken(token);

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true },
  });

  if (!user) {
    throw new AppError('UNAUTHORIZED', 'User not found', 401);
  }

  req.user = user;
  next();
});
