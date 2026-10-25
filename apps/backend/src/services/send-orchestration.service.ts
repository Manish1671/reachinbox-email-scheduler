import type { Job } from 'bullmq';
import type { Email, EmailCampaign, SmtpSenderAccount } from '@prisma/client';
import { getNextUtcHourStartMs } from '../redis/quota-hour';
import {
  confirmHourlyQuotaReservation,
  releaseHourlyQuotaReservation,
  reserveHourlyQuota,
} from '../redis/quota-lua';
import { acquireCampaignMinDelaySlot, getCampaignMinDelayWaitMs } from '../redis/min-delay';
import { redis } from '../queue/redis';
import { prisma } from '../db/prisma';
import { DeferSendError } from '../utils/defer-send-error';
import {
  getSmtpAccountForUser,
  getTransportForAccount,
  selectSenderRoundRobin,
} from './smtp-sender.service';
import {
  classifyDeliveryError,
  type DeliveryMessage,
  type DeliveryResult,
} from './email-delivery.service';
import { notifySenderQuotaExhausted } from './slack-notification.service';
import { deferQueuedEmail } from './email-processing.service';

export type EmailWithCampaign = Email & { campaign: EmailCampaign | null };

export async function resolveSenderForEmail(email: EmailWithCampaign): Promise<SmtpSenderAccount> {
  if (email.smtpSenderAccountId) {
    return getSmtpAccountForUser(email.userId, email.smtpSenderAccountId);
  }
  const selected = await selectSenderRoundRobin(email.userId);
  await prisma.email.update({
    where: { id: email.id },
    data: { smtpSenderAccountId: selected.id },
  });
  return selected;
}

export async function enforceSendGates(
  email: EmailWithCampaign,
  sender: SmtpSenderAccount,
  now = new Date(),
): Promise<void> {
  const nowMs = now.getTime();

  if (email.campaignId && email.campaign && email.campaign.minDelayMs > 0) {
    const waitMs = await getCampaignMinDelayWaitMs(
      redis,
      email.campaignId,
      email.campaign.minDelayMs,
      nowMs,
    );
    if (waitMs > 0) {
      throw new DeferSendError({
        delayMs: waitMs,
        reason: 'MIN_DELAY',
        message: `Campaign minimum delay not met; deferring ${waitMs}ms`,
      });
    }
  }

  if (email.campaignId && email.campaign) {
    const campaignReserve = await reserveHourlyQuota(
      redis,
      'campaign',
      email.campaignId,
      email.id,
      email.campaign.hourlyQuota,
      now,
    );
    if (!campaignReserve.ok) {
      const delayMs = Math.max(1_000, getNextUtcHourStartMs(now) - nowMs);
      throw new DeferSendError({
        delayMs,
        reason: 'CAMPAIGN_QUOTA_EXHAUSTED',
        message: 'Campaign hourly quota exhausted',
      });
    }
  }

  const senderReserve = await reserveHourlyQuota(
    redis,
    'sender',
    sender.id,
    email.id,
    sender.hourlyQuota,
    now,
  );
  if (!senderReserve.ok) {
    if (email.campaignId && email.campaign) {
      await releaseHourlyQuotaReservation(redis, 'campaign', email.campaignId, email.id, now);
    }
    const delayMs = Math.max(1_000, getNextUtcHourStartMs(now) - nowMs);
    throw new DeferSendError({
      delayMs,
      reason: 'SENDER_QUOTA_EXHAUSTED',
      message: 'Sender hourly quota exhausted',
      senderAccountId: sender.id,
      senderLabel: sender.label,
    });
  }

  if (email.campaignId && email.campaign && email.campaign.minDelayMs > 0) {
    const acquireWaitMs = await acquireCampaignMinDelaySlot(
      redis,
      email.campaignId,
      email.campaign.minDelayMs,
      nowMs,
    );
    if (acquireWaitMs > 0) {
      if (email.campaignId && email.campaign) {
        await releaseHourlyQuotaReservation(redis, 'campaign', email.campaignId, email.id, now);
      }
      await releaseHourlyQuotaReservation(redis, 'sender', sender.id, email.id, now);
      throw new DeferSendError({
        delayMs: acquireWaitMs,
        reason: 'MIN_DELAY',
        message: `Campaign minimum delay slot unavailable; deferring ${acquireWaitMs}ms`,
      });
    }
  }
}

export async function releaseQuotaReservations(
  email: EmailWithCampaign,
  sender: SmtpSenderAccount,
  now = new Date(),
): Promise<void> {
  if (email.campaignId) {
    await releaseHourlyQuotaReservation(redis, 'campaign', email.campaignId, email.id, now);
  }
  await releaseHourlyQuotaReservation(redis, 'sender', sender.id, email.id, now);
}

export async function confirmQuotaReservations(
  email: EmailWithCampaign,
  sender: SmtpSenderAccount,
  now = new Date(),
): Promise<void> {
  if (email.campaignId) {
    await confirmHourlyQuotaReservation(redis, 'campaign', email.campaignId, email.id, now);
  }
  await confirmHourlyQuotaReservation(redis, 'sender', sender.id, email.id, now);
}

export async function deliverWithSender(
  sender: SmtpSenderAccount,
  message: DeliveryMessage,
): Promise<DeliveryResult> {
  const transport = getTransportForAccount(sender);
  try {
    const info = await transport.sendMail({
      from: sender.mailFrom,
      to: message.recipient,
      subject: message.subject,
      text: message.body,
    });
    return {
      messageId: typeof info.messageId === 'string' ? info.messageId : undefined,
    };
  } catch (error) {
    throw classifyDeliveryError(error);
  }
}

export async function handleDeferredSend(
  job: Job,
  emailId: string,
  error: DeferSendError,
): Promise<void> {
  const token = job.token;
  if (!token) {
    throw new Error('Cannot defer job without an active BullMQ lock token');
  }

  const scheduledAt = new Date(Date.now() + error.delayMs);
  await deferQueuedEmail(emailId, {
    scheduledAt,
    deferralReason: error.reason,
  });
  await job.moveToDelayed(scheduledAt.getTime(), token);

  if (error.reason === 'SENDER_QUOTA_EXHAUSTED' && error.senderAccountId) {
    const email = await prisma.email.findUnique({ where: { id: emailId }, select: { userId: true } });
    if (email) {
      await notifySenderQuotaExhausted({
        userId: email.userId,
        senderAccountId: error.senderAccountId,
        senderLabel: error.senderLabel ?? 'SMTP sender',
      });
    }
  }
}

export async function recordSuccessfulCampaignSend(_email: EmailWithCampaign): Promise<void> {
  // Min-delay spacing is claimed in enforceSendGates via acquireCampaignMinDelaySlot.
}
