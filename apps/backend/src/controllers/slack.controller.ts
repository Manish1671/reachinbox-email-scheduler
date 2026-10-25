import type { Request, Response } from 'express';
import { env } from '../config/env';
import {
  buildSlackAuthorizeUrl,
  completeSlackOAuth,
  disconnectSlack,
  getSlackConnectionStatus,
  slackOAuthConfigured,
} from '../services/slack-oauth.service';
import { success } from '../utils/api-response';
import { requireUser } from '../utils/request-user';

export async function getSlackStatus(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const status = await getSlackConnectionStatus(user.id);
  res.json(
    success({
      ...status,
      configured: slackOAuthConfigured(),
    }),
  );
}

export async function startSlackConnect(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const { url } = await buildSlackAuthorizeUrl(user.id);
  res.json(success({ url }));
}

export async function slackOAuthCallback(req: Request, res: Response): Promise<void> {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!code || !state) {
    res.redirect(`${env.FRONTEND_URL}/settings?slack=error`);
    return;
  }

  try {
    const { redirectUrl } = await completeSlackOAuth(code, state);
    res.redirect(redirectUrl);
  } catch {
    res.redirect(`${env.FRONTEND_URL}/settings?slack=error`);
  }
}

export async function disconnectSlackHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  await disconnectSlack(user.id);
  res.status(204).send();
}
