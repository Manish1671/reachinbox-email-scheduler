import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { redis } from '../queue/redis';
import { AppError } from '../utils/app-error';
import { encryptSecret } from '../utils/secret-cipher';
import { logger } from '../utils/logger';

export type PublicSlackConnection = {
  connected: boolean;
  teamId?: string;
  teamName?: string;
  channelName?: string;
  scope?: string;
  connectedAt?: string;
};

const OAUTH_STATE_TTL_SECONDS = 600;

function oauthStateKey(state: string): string {
  return `slack:oauth:state:${state}`;
}

export async function buildSlackAuthorizeUrl(userId: string): Promise<{ url: string; state: string }> {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    throw new AppError('SLACK_NOT_CONFIGURED', 'Slack OAuth is not configured on the server', 503);
  }

  const state = randomBytes(24).toString('hex');
  const payload = JSON.stringify({ userId, state });
  await redis.set(oauthStateKey(state), payload, 'EX', OAUTH_STATE_TTL_SECONDS);

  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: env.SLACK_SCOPES,
    redirect_uri: env.SLACK_REDIRECT_URI,
    state,
  });

  return {
    state,
    url: `https://slack.com/oauth/v2/authorize?${params.toString()}`,
  };
}

export async function completeSlackOAuth(
  code: string,
  state: string,
): Promise<{ redirectUrl: string }> {
  const stored = await redis.get(oauthStateKey(state));
  if (!stored) {
    throw new AppError('SLACK_INVALID_STATE', 'Slack OAuth state is invalid or expired', 400);
  }
  await redis.del(oauthStateKey(state));

  const parsed = JSON.parse(stored) as { userId: string; state: string };
  if (parsed.state !== state) {
    throw new AppError('SLACK_INVALID_STATE', 'Slack OAuth state mismatch', 400);
  }

  const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: env.SLACK_REDIRECT_URI,
    }),
  });

  const payload = (await tokenResponse.json()) as {
    ok: boolean;
    error?: string;
    access_token?: string;
    scope?: string;
    team?: { id: string; name?: string };
    incoming_webhook?: { url: string; channel?: string; channel_id?: string };
  };

  if (!payload.ok || !payload.access_token) {
    logger.warn('[slack] oauth exchange failed', { error: payload.error });
    throw new AppError('SLACK_OAUTH_FAILED', 'Slack authorization failed', 502);
  }

  await prisma.slackConnection.upsert({
    where: { userId: parsed.userId },
    create: {
      userId: parsed.userId,
      teamId: payload.team?.id ?? 'unknown',
      teamName: payload.team?.name ?? null,
      channelId: payload.incoming_webhook?.channel_id ?? null,
      channelName: payload.incoming_webhook?.channel ?? null,
      accessTokenCipher: encryptSecret(payload.access_token),
      incomingWebhookCipher: payload.incoming_webhook?.url
        ? encryptSecret(payload.incoming_webhook.url)
        : null,
      scope: payload.scope ?? env.SLACK_SCOPES,
    },
    update: {
      teamId: payload.team?.id ?? 'unknown',
      teamName: payload.team?.name ?? null,
      channelId: payload.incoming_webhook?.channel_id ?? null,
      channelName: payload.incoming_webhook?.channel ?? null,
      accessTokenCipher: encryptSecret(payload.access_token),
      incomingWebhookCipher: payload.incoming_webhook?.url
        ? encryptSecret(payload.incoming_webhook.url)
        : null,
      scope: payload.scope ?? env.SLACK_SCOPES,
    },
  });

  return { redirectUrl: `${env.FRONTEND_URL}/settings?slack=connected` };
}

export async function getSlackConnectionStatus(userId: string): Promise<PublicSlackConnection> {
  const connection = await prisma.slackConnection.findUnique({ where: { userId } });
  if (!connection) {
    return { connected: false };
  }
  return {
    connected: true,
    teamId: connection.teamId,
    teamName: connection.teamName ?? undefined,
    channelName: connection.channelName ?? undefined,
    scope: connection.scope,
    connectedAt: connection.createdAt.toISOString(),
  };
}

export async function disconnectSlack(userId: string): Promise<void> {
  await prisma.slackConnection.deleteMany({ where: { userId } });
}

export function slackOAuthConfigured(): boolean {
  return Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && env.SLACK_REDIRECT_URI);
}

export function hashSlackState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}
