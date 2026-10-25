import type { Request, RequestHandler } from 'express';
import { prisma } from '../db/prisma';
import { AppError } from '../utils/app-error';
import { assertQueueDashboardAccess } from '../utils/queue-dashboard-access';
import { verifyAccessToken } from '../utils/jwt';
import { asyncHandler } from './async-handler';

const QUEUE_AUTH_COOKIE = 'outbox_queue_auth';

function readCookie(req: { headers: { cookie?: string } }, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) {
    return undefined;
  }
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator);
    if (key === name) {
      return decodeURIComponent(trimmed.slice(separator + 1));
    }
  }
  return undefined;
}

function readBearerToken(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }
  const match = /^Bearer\s+(\S+)$/.exec(header);
  return match?.[1];
}

async function attachUserFromToken(token: string, req: Request): Promise<void> {
  const payload = verifyAccessToken(token);
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, avatarUrl: true },
  });
  if (!user) {
    throw new AppError('UNAUTHORIZED', 'User not found', 401);
  }
  assertQueueDashboardAccess(user.email);
  req.user = user;
}

export const bullBoardAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const bearer = readBearerToken(req.headers.authorization);
  const cookieToken = readCookie(req, QUEUE_AUTH_COOKIE);
  const token = bearer ?? cookieToken;
  if (!token) {
    throw new AppError('UNAUTHORIZED', 'Authentication required for queue dashboard', 401);
  }
  await attachUserFromToken(token, req);
  next();
});

export function queueDashboardCookieName(): string {
  return QUEUE_AUTH_COOKIE;
}
