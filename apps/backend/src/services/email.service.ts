import { EmailStatus } from '@prisma/client';
import { DEFAULT_EMAIL_LIST_LIMIT } from '../config/constants';
import { prisma } from '../db/prisma';
import * as emailQueue from '../queue/email.queue';
import type { PublicEmail } from '../types/email';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';
import { toPublicEmail } from '../utils/public-email';
import { getEmailByIdForUser } from './email.access';

export type CreateScheduledEmailInput = {
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: Date;
};

export type EnqueueEmailJob = (emailId: string, scheduledAt: Date) => Promise<unknown>;

const PENDING_STATUSES: EmailStatus[] = [EmailStatus.SCHEDULED, EmailStatus.QUEUED];

export async function createScheduledEmail(
  ownerId: string,
  input: CreateScheduledEmailInput,
  enqueue: EnqueueEmailJob = emailQueue.addSendEmailJob,
): Promise<PublicEmail> {
  if (input.scheduledAt.getTime() <= Date.now()) {
    throw new AppError('INVALID_SCHEDULE_TIME', 'scheduledAt must be in the future', 400);
  }

  const email = await prisma.email.create({
    data: {
      userId: ownerId,
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      scheduledAt: input.scheduledAt,
      status: EmailStatus.SCHEDULED,
    },
  });

  logger.info('Created email', {
    emailId: email.id,
    scheduledAt: email.scheduledAt.toISOString(),
  });

  try {
    await enqueue(email.id, email.scheduledAt);
  } catch (error) {
    logger.error('Queue enqueue failed', { emailId: email.id, error });
    throw new AppError(
      'QUEUE_ENQUEUE_FAILED',
      'Email was saved but could not be queued. It remains scheduled for later recovery.',
      503,
    );
  }

  const queued = await prisma.email.update({
    where: { id: email.id },
    data: { status: EmailStatus.QUEUED },
  });

  logger.info('Queued email', {
    emailId: queued.id,
    scheduledAt: queued.scheduledAt.toISOString(),
    delayMs: emailQueue.calculateJobDelayMs(queued.scheduledAt),
  });

  return toPublicEmail(queued);
}

export async function listEmailsForUser(
  ownerId: string,
  options: { status?: EmailStatus; limit?: number } = {},
): Promise<PublicEmail[]> {
  const emails = await prisma.email.findMany({
    where: {
      userId: ownerId,
      ...(options.status ? { status: options.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: options.limit ?? DEFAULT_EMAIL_LIST_LIMIT,
  });

  return emails.map(toPublicEmail);
}

export async function listScheduledEmailsForUser(ownerId: string): Promise<PublicEmail[]> {
  const emails = await prisma.email.findMany({
    where: {
      userId: ownerId,
      status: { in: PENDING_STATUSES },
    },
    orderBy: { scheduledAt: 'asc' },
    take: DEFAULT_EMAIL_LIST_LIMIT,
  });

  return emails.map(toPublicEmail);
}

export async function listSentEmailsForUser(ownerId: string): Promise<PublicEmail[]> {
  const emails = await prisma.email.findMany({
    where: {
      userId: ownerId,
      status: EmailStatus.SENT,
    },
    orderBy: { sentAt: 'desc' },
    take: DEFAULT_EMAIL_LIST_LIMIT,
  });

  return emails.map(toPublicEmail);
}

export async function getOwnedEmail(emailId: string, ownerId: string): Promise<PublicEmail> {
  const email = await getEmailByIdForUser(emailId, ownerId);
  return toPublicEmail(email);
}
