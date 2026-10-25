import type { Request, Response } from 'express';
import { env } from '../config/env';
import { queueDashboardCookieName } from '../middleware/bull-board-auth';
import { getQueueDashboardPath } from '../queue/queue-dashboard';
import { success } from '../utils/api-response';
import { AppError } from '../utils/app-error';
import { assertQueueDashboardAccess } from '../utils/queue-dashboard-access';
import { requireUser } from '../utils/request-user';

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

export async function createQueueDashboardSession(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  assertQueueDashboardAccess(user.email);
  const token = readBearerToken(req.headers.authorization);

  const maxAgeMs = 60 * 60 * 1000;
  res.cookie(queueDashboardCookieName(), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: maxAgeMs,
    path: getQueueDashboardPath(),
  });

  res.json(success({ path: getQueueDashboardPath() }));
}
