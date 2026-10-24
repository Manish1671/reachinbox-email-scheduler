import { UnrecoverableError, Worker, type Job } from 'bullmq';
import { EMAIL_JOB_NAMES, QUEUE_NAMES } from '../config/constants';
import { env } from '../config/env';
import { getBullMqConnection } from '../queue/connection';
import type { SendEmailJobData } from '../queue/email.queue';
import { sendEmail } from '../services/email-delivery.service';
import { PermanentJobError } from '../utils/job-errors';
import { logger } from '../utils/logger';
import { processSendEmailJob, type DeliveryFn } from './email.processor';

export type CreateEmailWorkerOptions = {
  deliver?: DeliveryFn;
  autorun?: boolean;
  prefix?: string;
  concurrency?: number;
  limiter?: {
    max: number;
    duration: number;
  };
};

export function createEmailWorker(options: CreateEmailWorkerOptions = {}): Worker<SendEmailJobData> {
  const deliver = options.deliver ?? sendEmail;
  const concurrency = options.concurrency ?? env.EMAIL_WORKER_CONCURRENCY;
  const limiter = options.limiter ?? {
    max: env.EMAIL_RATE_LIMIT_MAX,
    duration: env.EMAIL_RATE_LIMIT_DURATION_MS,
  };

  let active = 0;

  const worker = new Worker<SendEmailJobData>(
    QUEUE_NAMES.EMAIL,
    async (job: Job<SendEmailJobData>) => {
      active += 1;
      logger.info('[worker] job received', {
        jobId: job.id,
        name: job.name,
        attempt: job.attemptsMade + 1,
        active,
      });
      try {
        await processSendEmailJob(job, deliver);
      } catch (error) {
        if (error instanceof PermanentJobError) {
          throw new UnrecoverableError(error.message);
        }
        throw error;
      } finally {
        active -= 1;
      }
    },
    {
      connection: getBullMqConnection(),
      concurrency,
      limiter,
      prefix: options.prefix,
      ...(options.autorun === undefined ? {} : { autorun: options.autorun }),
    },
  );

  worker.on('ready', () => {
    logger.info('[worker] ready', {
      queue: QUEUE_NAMES.EMAIL,
      jobName: EMAIL_JOB_NAMES.SEND_EMAIL,
      concurrency,
      rateLimitMax: limiter.max,
      rateLimitDurationMs: limiter.duration,
    });
  });

  worker.on('completed', (job) => {
    logger.info('[worker] job completed', { jobId: job.id, active });
  });

  worker.on('failed', (job, error) => {
    const maxAttempts = job?.opts.attempts;
    const permanentlyFailed =
      Boolean(job && maxAttempts !== undefined && job.attemptsMade >= maxAttempts);
    logger.error(permanentlyFailed ? '[worker] job permanently failed' : '[worker] job retry', {
      jobId: job?.id,
      attempt: job?.attemptsMade,
      active,
      error,
    });
  });

  worker.on('stalled', (jobId) => {
    logger.warn('[worker] job stalled', { jobId });
  });

  worker.on('error', (error) => {
    logger.error('[worker] error', { error });
  });

  return worker;
}
