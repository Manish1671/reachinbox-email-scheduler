import type { Request, Response } from 'express';
import {
  createScheduledEmail,
  getOwnedEmail,
  listEmailsForUser,
  listScheduledEmailsForUser,
  listSentEmailsForUser,
} from '../services/email.service';
import { success } from '../utils/api-response';
import { requireUser } from '../utils/request-user';
import type { CreateEmailBody, ListEmailsQuery } from '../validation/email.schema';

export async function createEmail(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const body = req.body as CreateEmailBody;
  const email = await createScheduledEmail(user.id, body);
  res.status(201).json(success(email));
}

export async function listEmails(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const query = req.query as unknown as ListEmailsQuery;
  const emails = await listEmailsForUser(user.id, {
    status: query.status,
    limit: query.limit,
  });
  res.json(success(emails));
}

export async function listScheduledEmails(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const emails = await listScheduledEmailsForUser(user.id);
  res.json(success(emails));
}

export async function listSentEmails(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const emails = await listSentEmailsForUser(user.id);
  res.json(success(emails));
}

export async function getEmail(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const email = await getOwnedEmail(req.params.id as string, user.id);
  res.json(success(email));
}
