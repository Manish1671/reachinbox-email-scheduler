import type { Request, Response } from 'express';
import { EmailStatus } from '@prisma/client';
import { reindexUserEmails } from '../services/email-search-index.service';
import { searchEmailsForUser } from '../services/email-search.service';
import { success } from '../utils/api-response';
import { requireUser } from '../utils/request-user';
import type { EmailSearchQuery } from '../validation/email-search.schema';

export async function searchEmails(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const query = req.query as unknown as EmailSearchQuery;

  const result = await searchEmailsForUser({
    userId: user.id,
    q: query.q,
    status: query.status as EmailStatus | undefined,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
  });

  res.json(success(result));
}

export async function reindexEmails(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const cursor = typeof req.body?.cursor === 'string' ? req.body.cursor : undefined;
  const batchSize =
    typeof req.body?.batchSize === 'number' && req.body.batchSize > 0
      ? Math.min(req.body.batchSize, 500)
      : 100;

  const result = await reindexUserEmails(user.id, batchSize, cursor);
  res.json(success(result));
}
