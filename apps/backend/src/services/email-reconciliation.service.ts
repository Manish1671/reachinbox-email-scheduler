import { EmailStatus, type Email } from '@prisma/client';
import { EMAIL_RECONCILE_BATCH_SIZE } from '../config/constants';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import {
  ensureSendEmailJob,
  getEmailJobState,
  getEmailQueue,
  isLiveJobState,
  removeIdleEmailJob,
  type SendEmailJobData,
} from '../queue/email.queue';
import { logger } from '../utils/logger';
import { markScheduledEmailQueued, releaseStaleProcessingEmail } from './email-processing.service';
import type { Queue } from 'bullmq';

export type ReconcileOptions = {
  queue?: Queue<SendEmailJobData>;
  now?: Date;
  processingTimeoutMs?: number;
  batchSize?: number;
  emailIds?: string[];
};

export type ReconcileSummary = {
  scanned: number;
  scheduledRecovered: number;
  queuedRecovered: number;
  processingReleased: number;
  processingSkippedActive: number;
  sentJobsRemoved: number;
  skipped: number;
};

const RECOVERABLE_STATUSES: EmailStatus[] = [
  EmailStatus.SCHEDULED,
  EmailStatus.QUEUED,
  EmailStatus.PROCESSING,
];

export async function reconcileEmailQueue(
  options: ReconcileOptions = {},
): Promise<ReconcileSummary> {
  const queue = options.queue ?? getEmailQueue();
  const now = options.now ?? new Date();
  const processingTimeoutMs = options.processingTimeoutMs ?? env.EMAIL_PROCESSING_TIMEOUT_MS;
  const batchSize = options.batchSize ?? EMAIL_RECONCILE_BATCH_SIZE;
  const staleBefore = new Date(now.getTime() - processingTimeoutMs);

  const summary: ReconcileSummary = {
    scanned: 0,
    scheduledRecovered: 0,
    queuedRecovered: 0,
    processingReleased: 0,
    processingSkippedActive: 0,
    sentJobsRemoved: 0,
    skipped: 0,
  };

  logger.info('[reconcile] started', {
    processingTimeoutMs,
    batchSize,
    staleBefore: staleBefore.toISOString(),
  });

  let cursor: string | undefined;

  for (;;) {
    const emails = await prisma.email.findMany({
      where: {
        status: { in: RECOVERABLE_STATUSES },
        ...(options.emailIds ? { id: { in: options.emailIds } } : {}),
      },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (emails.length === 0) {
      break;
    }

    for (const email of emails) {
      summary.scanned += 1;
      await reconcileRecoverableEmail(email, queue, now, staleBefore, summary);
    }

    cursor = emails[emails.length - 1]?.id;
    if (!cursor || emails.length < batchSize) {
      break;
    }
  }

  summary.sentJobsRemoved = await removeLeftoverSentJobs(queue, batchSize);

  logger.info('[reconcile] completed', summary);
  return summary;
}

async function reconcileRecoverableEmail(
  email: Email,
  queue: Queue<SendEmailJobData>,
  now: Date,
  staleBefore: Date,
  summary: ReconcileSummary,
): Promise<void> {
  const state = await getEmailJobState(email.id, queue);

  if (email.status === EmailStatus.SCHEDULED) {
    const ensured = await ensureSendEmailJob(email.id, email.scheduledAt, queue, now);
    const queued = await markScheduledEmailQueued(email.id);
    if (queued) {
      summary.scheduledRecovered += 1;
      logger.info('[reconcile] recovered SCHEDULED email', {
        emailId: email.id,
        createdJob: ensured.created,
        delayMs: Math.max(0, email.scheduledAt.getTime() - now.getTime()),
      });
      return;
    }
    summary.skipped += 1;
    return;
  }

  if (email.status === EmailStatus.QUEUED) {
    if (isLiveJobState(state)) {
      summary.skipped += 1;
      return;
    }

    const ensured = await ensureSendEmailJob(email.id, email.scheduledAt, queue, now);
    summary.queuedRecovered += 1;
    logger.info('[reconcile] recovered QUEUED email', {
      emailId: email.id,
      createdJob: ensured.created,
      previousState: state,
    });
    return;
  }

  if (state === 'active') {
    summary.processingSkippedActive += 1;
    logger.info('[reconcile] skipped active PROCESSING email', { emailId: email.id });
    return;
  }

  if (email.updatedAt >= staleBefore) {
    summary.skipped += 1;
    logger.info('[reconcile] skipped fresh PROCESSING email', {
      emailId: email.id,
      updatedAt: email.updatedAt.toISOString(),
    });
    return;
  }

  const released = await releaseStaleProcessingEmail(email.id, staleBefore);
  if (!released) {
    summary.skipped += 1;
    return;
  }

  summary.processingReleased += 1;
  logger.info('[reconcile] released stale PROCESSING email', {
    emailId: email.id,
    previousJobState: state,
  });

  if (!isLiveJobState(state)) {
    await ensureSendEmailJob(email.id, email.scheduledAt, queue, now);
  }
}

async function removeLeftoverSentJobs(
  queue: Queue<SendEmailJobData>,
  pageSize: number,
): Promise<number> {
  let removed = 0;
  let start = 0;

  for (;;) {
    const jobs = await queue.getJobs(
      ['waiting', 'delayed', 'paused', 'prioritized', 'completed', 'failed'],
      start,
      start + pageSize - 1,
    );

    if (jobs.length === 0) {
      break;
    }

    for (const job of jobs) {
      const emailId = typeof job.id === 'string' ? job.id : undefined;
      if (!emailId) {
        continue;
      }

      const email = await prisma.email.findUnique({
        where: { id: emailId },
        select: { status: true },
      });

      if (email?.status !== EmailStatus.SENT) {
        continue;
      }

      const didRemove = await removeIdleEmailJob(emailId, queue);
      if (didRemove) {
        removed += 1;
        logger.info('[reconcile] removed leftover SENT job', { emailId });
      }
    }

    if (jobs.length < pageSize) {
      break;
    }
    start += pageSize;
  }

  return removed;
}
