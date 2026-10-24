import type { Worker } from 'bullmq';
import { QUEUE_NAMES } from '../config/constants';
import { env } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../db/prisma';
import { closeEmailQueue } from '../queue/email.queue';
import { hasEtherealCredentials } from '../services/email-delivery.service';
import { reconcileEmailQueue } from '../services/email-reconciliation.service';
import { logger } from '../utils/logger';
import { createEmailWorker, type CreateEmailWorkerOptions } from './email.worker';

export type EmailWorkerRuntime = {
  worker: Worker;
  shutdown: (signal?: string) => Promise<void>;
};

export type StartEmailWorkerRuntimeOptions = CreateEmailWorkerOptions & {
  skipReconcile?: boolean;
  reconcile?: () => Promise<unknown>;
};

export async function startEmailWorkerRuntime(
  options: StartEmailWorkerRuntimeOptions = {},
): Promise<EmailWorkerRuntime> {
  logger.info('[worker] started', {
    env: env.NODE_ENV,
    queue: QUEUE_NAMES.EMAIL,
    concurrency: options.concurrency ?? env.EMAIL_WORKER_CONCURRENCY,
    rateLimitMax: options.limiter?.max ?? env.EMAIL_RATE_LIMIT_MAX,
    rateLimitDurationMs: options.limiter?.duration ?? env.EMAIL_RATE_LIMIT_DURATION_MS,
  });

  await connectDatabase();

  if (!hasEtherealCredentials() && !options.deliver) {
    logger.error(
      '[worker] Ethereal credentials are not configured. Delivery jobs will fail until ETHEREAL_USER and ETHEREAL_PASS are set.',
    );
  }

  if (!options.skipReconcile) {
    await (options.reconcile ?? reconcileEmailQueue)();
  }

  const worker = createEmailWorker(options);
  let shuttingDown = false;

  const shutdown = async (signal = 'shutdown'): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info('[worker] shutting down', { signal });
    await worker.close();
    await closeEmailQueue();
    await disconnectDatabase();
  };

  return { worker, shutdown };
}
