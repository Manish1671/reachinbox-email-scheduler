import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  ClientSecretPost,
  discovery,
  randomPKCECodeVerifier,
  randomState,
  type Configuration,
} from 'openid-client';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { redis } from '../queue/redis';
import type { AuthResult } from '../types/auth';
import { AppError } from '../utils/app-error';
import { signAccessToken } from '../utils/jwt';
import { toPublicUser } from '../utils/public-user';
import { logger } from '../utils/logger';
import { validateGoogleIdTokenClaims } from './google-id-token';

const GOOGLE_ISSUER = 'https://accounts.google.com';
const OAUTH_STATE_TTL_SECONDS = 600;
const EXCHANGE_CODE_TTL_SECONDS = 60;

type OAuthStatePayload = {
  state: string;
  codeVerifier: string;
};

function oauthStateKey(state: string): string {
  return `google:oauth:state:${state}`;
}

function exchangeCodeKey(code: string): string {
  return `google:exchange:${code}`;
}

let googleConfiguration: Configuration | undefined;

export function googleOAuthConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

async function getGoogleConfiguration(): Promise<Configuration> {
  if (!googleOAuthConfigured()) {
    throw new AppError('GOOGLE_NOT_CONFIGURED', 'Google OAuth is not configured on the server', 503);
  }
  if (!googleConfiguration) {
    googleConfiguration = await discovery(
      new URL(GOOGLE_ISSUER),
      env.GOOGLE_CLIENT_ID,
      { redirect_uris: [env.GOOGLE_REDIRECT_URI] },
      ClientSecretPost(env.GOOGLE_CLIENT_SECRET),
    );
  }
  return googleConfiguration;
}

export async function startGoogleOAuth(): Promise<{ url: string }> {
  const config = await getGoogleConfiguration();
  const codeVerifier = randomPKCECodeVerifier();
  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
  const state = randomState();

  const payload: OAuthStatePayload = { state, codeVerifier };
  await redis.set(oauthStateKey(state), JSON.stringify(payload), 'EX', OAUTH_STATE_TTL_SECONDS);

  const url = buildAuthorizationUrl(config, {
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    scope: 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    prompt: 'select_account',
  });

  return { url: url.href };
}

export async function completeGoogleOAuthCallback(callbackUrl: URL): Promise<{ redirectUrl: string }> {
  const config = await getGoogleConfiguration();
  const state = callbackUrl.searchParams.get('state') ?? '';
  if (!state) {
    throw new AppError('GOOGLE_INVALID_STATE', 'Missing OAuth state', 400);
  }

  const stored = await redis.getdel(oauthStateKey(state));
  if (!stored) {
    throw new AppError('GOOGLE_INVALID_STATE', 'OAuth state is invalid or expired', 400);
  }

  const parsed = JSON.parse(stored) as OAuthStatePayload;
  if (parsed.state !== state) {
    throw new AppError('GOOGLE_INVALID_STATE', 'OAuth state mismatch', 400);
  }

  let tokenResponse;
  try {
    tokenResponse = await authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: parsed.codeVerifier,
      expectedState: state,
    });
  } catch (error) {
    logger.warn('[google] authorization code grant failed', { error });
    throw new AppError('GOOGLE_OAUTH_FAILED', 'Google authorization failed', 502);
  }

  const claims = tokenResponse.claims() as Record<string, unknown> | undefined;
  if (!claims) {
    throw new AppError('GOOGLE_INVALID_TOKEN', 'Google ID token claims are missing', 401);
  }

  const profile = validateGoogleIdTokenClaims(claims);
  const authResult = await upsertGoogleUser(profile);

  const exchangeCode = randomState();
  await redis.set(
    exchangeCodeKey(exchangeCode),
    JSON.stringify({ userId: authResult.user.id }),
    'EX',
    EXCHANGE_CODE_TTL_SECONDS,
  );

  return {
    redirectUrl: `${env.GOOGLE_FRONTEND_CALLBACK_URL}?code=${encodeURIComponent(exchangeCode)}`,
  };
}

async function upsertGoogleUser(profile: {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}): Promise<AuthResult> {
  const byGoogle = await prisma.user.findUnique({ where: { googleSubject: profile.sub } });
  if (byGoogle) {
    const updated = await prisma.user.update({
      where: { id: byGoogle.id },
      data: {
        email: profile.email,
        name: profile.name ?? null,
        avatarUrl: profile.picture ?? null,
      },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });
    return { user: toPublicUser(updated), token: signAccessToken(updated.id) };
  }

  const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    throw new AppError(
      'GOOGLE_EMAIL_ALREADY_REGISTERED',
      'An account with this email already exists. Sign in with email and password.',
      409,
    );
  }

  const created = await prisma.user.create({
    data: {
      email: profile.email,
      googleSubject: profile.sub,
      name: profile.name ?? null,
      avatarUrl: profile.picture ?? null,
      passwordHash: null,
    },
    select: { id: true, email: true, name: true, avatarUrl: true },
  });

  return { user: toPublicUser(created), token: signAccessToken(created.id) };
}

export async function exchangeGoogleCode(code: string): Promise<AuthResult> {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new AppError('GOOGLE_EXCHANGE_INVALID', 'Exchange code is invalid or expired', 400);
  }

  const stored = await redis.getdel(exchangeCodeKey(trimmed));
  if (!stored) {
    throw new AppError('GOOGLE_EXCHANGE_INVALID', 'Exchange code is invalid or expired', 400);
  }

  const parsed = JSON.parse(stored) as { userId: string };
  const user = await prisma.user.findUnique({
    where: { id: parsed.userId },
    select: { id: true, email: true, name: true, avatarUrl: true },
  });
  if (!user) {
    throw new AppError('UNAUTHORIZED', 'User not found', 401);
  }

  return { user: toPublicUser(user), token: signAccessToken(user.id) };
}
