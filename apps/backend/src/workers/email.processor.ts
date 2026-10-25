import type { Job } from 'bullmq';
import { z } from 'zod';
import { EMAIL_JOB_ATTEMPTS, EMAIL_JOB_NAMES } from '../config/constants';
import { prisma } from '../db/prisma';
import { sendEmail, type DeliveryMessage, type DeliveryResult } from '../services/email-delivery.service';
import {
  claimQueuedEmail,
  markEmailFailed,
  markEmailSent,
  releaseEmailForRetry,
} from '../services/email-processing.service';
import {
  confirmQuotaReservations,
  deliverWithSender,
  enforceSendGates,
  handleDeferredSend,
  recordSuccessfulCampaignSend,
  releaseQuotaReservations,
  resolveSenderForEmail,
  type EmailWithCampaign,
} from '../services/send-orchestration.service';
import { DeferSendError } from '../utils/defer-send-error';
import { PermanentJobError, RetryableJobError } from '../utils/job-errors';
import { logger } from '../utils/logger';
import type { SendEmailJobData } from '../queue/email.queue';

export type DeliveryFn = (message: DeliveryMessage) => Promise<DeliveryResult>;

export type SendEmailJobLike = {
  id?: string;
  name?: string;
  data: unknown;
  attemptsMade: number;
  opts: { attempts?: number };
  token?: string;
  moveToDelayed?: (timestamp: number, token?: string) => Promise<void>;
};

const jobDataSchema = z.object({
  emailId: z.string().uuid('emailId must be a UUID'),
});

export function isFinalAttempt(job: SendEmailJobLike): boolean {
  const maxAttempts = job.opts.attempts ?? EMAIL_JOB_ATTEMPTS;
  return job.attemptsMade + 1 >= maxAttempts;
}

function isOrchestratedJob(job: SendEmailJobLike): job is Job<SendEmailJobData> {
  return typeof job.moveToDelayed === 'function';
}

async function loadEmailWithCampaign(emailId: string): Promise<EmailWithCampaign | null> {
  return prisma.email.findUnique({
    where: { id: emailId },
    include: { campaign: true },
  });
}

async function processWithInjectedDeliver(
  job: SendEmailJobLike,
  email: EmailWithCampaign,
  deliver: DeliveryFn,
): Promise<void> {
  try {
    const result = await deliver({
      recipient: email.recipient,
      subject: email.subject,
      body: email.body,
    });
    await markEmailSent(email.id, result.messageId);
  } catch (error) {
    await handleDeliveryFailure(job, email.id, error);
  }
}

async function processWithOrchestration(job: SendEmailJobLike, email: EmailWithCampaign): Promise<void> {
  const sender = await resolveSenderForEmail(email);

  try {
    await enforceSendGates(email, sender);
    const result = await deliverWithSender(sender, {
      recipient: email.recipient,
      subject: email.subject,
      body: email.body,
    });
    await confirmQuotaReservations(email, sender);
    await recordSuccessfulCampaignSend(email);
    await markEmailSent(email.id, result.messageId);
    logger.info('[email] sent', { emailId: email.id, smtpSenderAccountId: sender.id });
  } catch (error) {
    if (error instanceof DeferSendError) {
      if (isOrchestratedJob(job)) {
        await handleDeferredSend(job, email.id, error);
        return;
      }
      throw error;
    }

    await releaseQuotaReservations(email, sender).catch(() => undefined);
    await handleDeliveryFailure(job, email.id, error);
  }
}

async function handleDeliveryFailure(
  job: SendEmailJobLike,
  emailId: string,
  error: unknown,
): Promise<void> {
  const classified =
    error instanceof RetryableJobError || error instanceof PermanentJobError
      ? error
      : new RetryableJobError(error instanceof Error ? error.message : 'Email delivery failed', {
          cause: error,
        });
  const message = classified.message;

  if (classified instanceof PermanentJobError || isFinalAttempt(job)) {
    await markEmailFailed(emailId, message);
    logger.error('[email] send failed permanently', { emailId, errorMessage: message });
    throw classified instanceof PermanentJobError
      ? classified
      : new PermanentJobError(message, { cause: error });
  }

  await releaseEmailForRetry(emailId);
  logger.warn('[email] send failed; returning to QUEUED for retry', { emailId, errorMessage: message });
  throw classified;
}

export async function processSendEmailJob(
  job: SendEmailJobLike,
  deliver: DeliveryFn = sendEmail,
  options: { orchestrate?: boolean } = {},
): Promise<void> {
  if (job.name && job.name !== EMAIL_JOB_NAMES.SEND_EMAIL) {
    throw new PermanentJobError(`Unexpected job name: ${job.name}`);
  }

  const parsed = jobDataSchema.safeParse(job.data);
  if (!parsed.success) {
    logger.error('[worker] malformed job payload', { jobId: job.id, data: job.data });
    throw new PermanentJobError('Malformed send-email job payload');
  }

  const { emailId } = parsed.data;
  logger.info('[worker] processing email', { emailId, jobId: job.id });

  const claim = await claimQueuedEmail(emailId);

  switch (claim.kind) {
    case 'missing':
      logger.error('[worker] email record missing', { emailId });
      throw new PermanentJobError(`Email record ${emailId} was not found`);
    case 'already-sent':
      logger.info('[email] already SENT; skipping send', { emailId });
      return;
    case 'already-processing':
      logger.warn('[email] already PROCESSING; not sending again', { emailId });
      return;
    case 'already-failed':
      logger.warn('[email] already FAILED; not sending', { emailId });
      throw new PermanentJobError(`Email ${emailId} is FAILED and will not be sent`);
    case 'not-queued':
      logger.warn('[email] unexpected status; not sending', { emailId, status: claim.status });
      throw new PermanentJobError(
        `Email ${emailId} is ${claim.status} and cannot be claimed for sending`,
      );
    case 'claimed':
      break;
  }

  const email = await loadEmailWithCampaign(emailId);
  if (!email) {
    throw new PermanentJobError(`Email record ${emailId} was not found`);
  }

  const orchestrate = options.orchestrate ?? deliver === sendEmail;
  if (orchestrate) {
    await processWithOrchestration(job, email);
    return;
  }

  await processWithInjectedDeliver(job, email, deliver);
}
