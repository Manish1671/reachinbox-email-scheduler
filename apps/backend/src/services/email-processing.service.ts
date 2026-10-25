import { EmailStatus, type Email } from '@prisma/client';
import { FAILURE_REASON_MAX_LENGTH } from '../config/constants';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { scheduleEmailSearchIndex } from './email-search-index.service';

export type ClaimResult =
  | { kind: 'claimed'; email: Email }
  | { kind: 'missing' }
  | { kind: 'already-sent' }
  | { kind: 'already-processing' }
  | { kind: 'already-failed' }
  | { kind: 'not-queued'; status: EmailStatus };

export async function claimQueuedEmail(emailId: string): Promise<ClaimResult> {
  const claimed = await prisma.email.updateMany({
    where: { id: emailId, status: EmailStatus.QUEUED },
    data: { status: EmailStatus.PROCESSING, failureReason: null },
  });

  if (claimed.count === 1) {
    const email = await prisma.email.findUnique({ where: { id: emailId } });
    if (!email) {
      return { kind: 'missing' };
    }
    return { kind: 'claimed', email };
  }

  const current = await prisma.email.findUnique({ where: { id: emailId } });
  if (!current) {
    return { kind: 'missing' };
  }
  if (current.status === EmailStatus.SENT) {
    return { kind: 'already-sent' };
  }
  if (current.status === EmailStatus.PROCESSING) {
    return { kind: 'already-processing' };
  }
  if (current.status === EmailStatus.FAILED) {
    return { kind: 'already-failed' };
  }
  return { kind: 'not-queued', status: current.status };
}

export async function markEmailSent(
  emailId: string,
  providerMessageId?: string,
): Promise<void> {
  const updated = await prisma.email.updateMany({
    where: { id: emailId, status: EmailStatus.PROCESSING },
    data: {
      status: EmailStatus.SENT,
      sentAt: new Date(),
      providerMessageId: providerMessageId ?? null,
      failureReason: null,
      deferralReason: null,
    },
  });
  if (updated.count > 0) {
    scheduleEmailSearchIndex(emailId);
  }
}

export async function deferQueuedEmail(
  emailId: string,
  options: { scheduledAt: Date; deferralReason: string },
): Promise<void> {
  const updated = await prisma.email.updateMany({
    where: { id: emailId, status: { in: [EmailStatus.PROCESSING, EmailStatus.QUEUED] } },
    data: {
      status: EmailStatus.QUEUED,
      scheduledAt: options.scheduledAt,
      deferralReason: options.deferralReason,
      failureReason: null,
    },
  });
  if (updated.count > 0) {
    scheduleEmailSearchIndex(emailId);
  }
}

export async function releaseEmailForRetry(emailId: string): Promise<void> {
  await prisma.email.updateMany({
    where: { id: emailId, status: EmailStatus.PROCESSING },
    data: { status: EmailStatus.QUEUED },
  });
}

export async function markScheduledEmailQueued(emailId: string): Promise<boolean> {
  const updated = await prisma.email.updateMany({
    where: { id: emailId, status: EmailStatus.SCHEDULED },
    data: { status: EmailStatus.QUEUED },
  });
  return updated.count === 1;
}

export async function releaseStaleProcessingEmail(
  emailId: string,
  staleBefore: Date,
): Promise<boolean> {
  const updated = await prisma.email.updateMany({
    where: {
      id: emailId,
      status: EmailStatus.PROCESSING,
      updatedAt: { lt: staleBefore },
    },
    data: { status: EmailStatus.QUEUED },
  });
  return updated.count === 1;
}

export async function markEmailFailed(emailId: string, reason: string): Promise<void> {
  const updated = await prisma.email.updateMany({
    where: {
      id: emailId,
      status: { in: [EmailStatus.PROCESSING, EmailStatus.QUEUED] },
    },
    data: {
      status: EmailStatus.FAILED,
      failureReason: sanitizeFailureReason(reason),
    },
  });
  if (updated.count > 0) {
    scheduleEmailSearchIndex(emailId);
  }
}

export function sanitizeFailureReason(reason: string): string {
  let message = reason;
  if (env.ETHEREAL_PASS) {
    message = message.split(env.ETHEREAL_PASS).join('[redacted]');
  }
  return message.slice(0, FAILURE_REASON_MAX_LENGTH);
}
