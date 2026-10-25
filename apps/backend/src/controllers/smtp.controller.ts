import type { Request, Response } from 'express';
import {
  createSmtpAccount,
  listSmtpAccountsForUser,
  setSmtpAccountEnabled,
} from '../services/smtp-sender.service';
import { success } from '../utils/api-response';
import { requireUser } from '../utils/request-user';
import type { CreateSmtpAccountBody } from '../validation/smtp.schema';

export async function listSmtpAccounts(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const accounts = await listSmtpAccountsForUser(user.id);
  res.json(success(accounts));
}

export async function createSmtpAccountHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const body = req.body as CreateSmtpAccountBody;
  const account = await createSmtpAccount(user.id, body);
  res.status(201).json(success(account));
}

export async function updateSmtpAccountEnabled(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const account = await setSmtpAccountEnabled(user.id, req.params.id as string, req.body.enabled);
  res.json(success(account));
}
