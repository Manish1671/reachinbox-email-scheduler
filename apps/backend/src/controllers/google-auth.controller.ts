import type { Request, Response } from 'express';
import { env } from '../config/env';
import {
  completeGoogleOAuthCallback,
  exchangeGoogleCode,
  googleOAuthConfigured,
  startGoogleOAuth,
} from '../services/google-auth.service';
import { success } from '../utils/api-response';
import { AppError } from '../utils/app-error';

function frontendCallbackWithError(code: string, message: string): string {
  const url = new URL(env.GOOGLE_FRONTEND_CALLBACK_URL);
  url.searchParams.set('error', code);
  url.searchParams.set('message', message);
  return url.href;
}

export async function googleOAuthStart(_req: Request, res: Response): Promise<void> {
  if (!googleOAuthConfigured()) {
    throw new AppError('GOOGLE_NOT_CONFIGURED', 'Google OAuth is not configured on the server', 503);
  }
  const result = await startGoogleOAuth();
  res.json(success(result));
}

export async function googleOAuthCallback(req: Request, res: Response): Promise<void> {
  if (!googleOAuthConfigured()) {
    res.redirect(frontendCallbackWithError('GOOGLE_NOT_CONFIGURED', 'Google sign-in is unavailable'));
    return;
  }

  const oauthError = typeof req.query.error === 'string' ? req.query.error : undefined;
  if (oauthError) {
    res.redirect(frontendCallbackWithError('GOOGLE_OAUTH_DENIED', 'Google sign-in was cancelled or denied'));
    return;
  }

  try {
    const callbackUrl = new URL(env.GOOGLE_REDIRECT_URI);
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        callbackUrl.searchParams.set(key, value);
      }
    }
    const result = await completeGoogleOAuthCallback(callbackUrl);
    res.redirect(result.redirectUrl);
  } catch (error) {
    const code = error instanceof AppError ? error.code : 'GOOGLE_OAUTH_FAILED';
    const message =
      error instanceof AppError ? error.message : 'Google sign-in failed. Please try again.';
    res.redirect(frontendCallbackWithError(code, message));
  }
}

export async function googleOAuthExchange(req: Request, res: Response): Promise<void> {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  if (!code) {
    throw new AppError('VALIDATION_ERROR', 'Exchange code is required', 400);
  }
  const result = await exchangeGoogleCode(code);
  res.json(success(result));
}
