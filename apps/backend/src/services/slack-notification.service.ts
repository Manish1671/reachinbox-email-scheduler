import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { redis } from '../queue/redis';
import { decryptSecret } from '../utils/secret-cipher';
import { logger } from '../utils/logger';

export async function notifySenderQuotaExhausted(options: {
  userId: string;
  senderAccountId: string;
  senderLabel: string;
}): Promise<void> {
  try {
    const debounceKey = `slack:debounce:quota:${options.senderAccountId}`;
    const acquired = await redis.set(debounceKey, '1', 'PX', env.SLACK_NOTIFY_DEBOUNCE_MS, 'NX');
    if (acquired !== 'OK') {
      return;
    }

    const connection = await prisma.slackConnection.findUnique({
      where: { userId: options.userId },
    });
    if (!connection) {
      return;
    }

    const text = `Hourly send quota reached for SMTP sender "${options.senderLabel}". Remaining campaign emails will be deferred to the next UTC hour.`;

    if (connection.incomingWebhookCipher) {
      const webhookUrl = decryptSecret(connection.incomingWebhookCipher);
      await postSlackWebhook(webhookUrl, text);
      return;
    }

    const token = decryptSecret(connection.accessTokenCipher);
    if (connection.channelId) {
      await postSlackChatMessage(token, connection.channelId, text);
    }
  } catch (error) {
    logger.warn('[slack] quota notification failed', {
      userId: options.userId,
      senderAccountId: options.senderAccountId,
      error,
    });
  }
}

async function postSlackWebhook(webhookUrl: string, text: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    throw new Error(`Slack webhook failed with status ${response.status}`);
  }
}

async function postSlackChatMessage(token: string, channel: string, text: string): Promise<void> {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel, text }),
  });
  const payload = (await response.json()) as { ok: boolean; error?: string };
  if (!payload.ok) {
    throw new Error(payload.error ?? 'Slack chat.postMessage failed');
  }
}
