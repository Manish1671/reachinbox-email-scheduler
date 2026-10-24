import { z } from 'zod';
import { EMAIL_JOB_ATTEMPTS, EMAIL_JOB_NAMES } from '../config/constants';
import { sendEmail, type DeliveryMessage, type DeliveryResult } from '../services/email-delivery.service';
import {
  claimQueuedEmail,
  markEmailFailed,
  markEmailSent,
  releaseEmailForRetry,
} from '../services/email-processing.service';
import { PermanentJobError, RetryableJobError } from '../utils/job-errors';
import { logger } from '../utils/logger';

export type SendEmailJobLike = {
  id?: string;
  name?: string;
  data: unknown;
  attemptsMade: number;
  opts: { attempts?: number };
};

export type DeliveryFn = (message: DeliveryMessage) => Promise<DeliveryResult>;

const jobDataSchema = z.object({
  emailId: z.string().uuid('emailId must be a UUID'),
});

export function isFinalAttempt(job: SendEmailJobLike): boolean {
  const maxAttempts = job.opts.attempts ?? EMAIL_JOB_ATTEMPTS;
  return job.attemptsMade + 1 >= maxAttempts;
}

export async function processSendEmailJob(
  job: SendEmailJobLike,
  deliver: DeliveryFn = sendEmail,
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

  const email = claim.email;
  logger.info('[email] claimed', { emailId, recipient: email.recipient });

  try {
    logger.info('[email] sending', { emailId });
    const result = await deliver({
      recipient: email.recipient,
      subject: email.subject,
      body: email.body,
    });
    await markEmailSent(emailId, result.messageId);
    logger.info('[email] sent', { emailId, providerMessageId: result.messageId });
  } catch (error) {
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
}
