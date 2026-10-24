import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { EmailStatus } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { createEmailQueue } from '../queue/email.queue';
import { reconcileEmailQueue } from '../services/email-reconciliation.service';
import { RetryableJobError } from '../utils/job-errors';
import { createTestUser, deleteUsers, futureIso } from '../test/helpers';
import { createEmailWorker } from './email.worker';
import { startEmailWorkerRuntime } from './runtime';

const createdUserIds: string[] = [];
const queues: Queue[] = [];
const workers: Worker[] = [];

after(async () => {
  for (const worker of workers) {
    await worker.close();
  }
  for (const queue of queues) {
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
  }
  await deleteUsers(createdUserIds);
});

function testPrefix(): string {
  return `{wrk-${randomUUID()}}`;
}

function isolatedQueue(prefix: string): Queue {
  const queue = createEmailQueue({ prefix });
  queues.push(queue);
  return queue;
}

async function insertQueued(userId: string) {
  return prisma.email.create({
    data: {
      userId,
      recipient: 'recipient@example.com',
      subject: 'Reliability',
      body: 'Body',
      scheduledAt: new Date(futureIso()),
      status: EmailStatus.QUEUED,
    },
  });
}

async function waitUntil(label: string, fn: () => Promise<boolean>, timeoutMs = 12_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await fn()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

describe('email worker reliability', () => {
  it('configures BullMQ concurrency and limiter from env', async () => {
    const worker = createEmailWorker({
      deliver: async () => ({ messageId: 'unused' }),
      autorun: false,
    });
    workers.push(worker);

    assert.equal(worker.opts.concurrency, env.EMAIL_WORKER_CONCURRENCY);
    assert.equal(worker.opts.limiter?.max, env.EMAIL_RATE_LIMIT_MAX);
    assert.equal(worker.opts.limiter?.duration, env.EMAIL_RATE_LIMIT_DURATION_MS);
  });

  it('runs reconciliation before the worker starts consuming', async () => {
    const order: string[] = [];
    const runtime = await startEmailWorkerRuntime({
      autorun: false,
      deliver: async () => ({ messageId: 'unused' }),
      reconcile: async () => {
        order.push('reconcile');
      },
    });
    workers.push(runtime.worker);
    order.push('worker');
    assert.deepEqual(order, ['reconcile', 'worker']);
  });

  it('never runs more jobs than the configured concurrency', async () => {
    const owner = await createTestUser('conc-owner');
    createdUserIds.push(owner.user.id);
    const prefix = testPrefix();
    const queue = isolatedQueue(prefix);
    const emails = await Promise.all([
      insertQueued(owner.user.id),
      insertQueued(owner.user.id),
      insertQueued(owner.user.id),
      insertQueued(owner.user.id),
    ]);

    let inFlight = 0;
    let maxInFlight = 0;
    const worker = createEmailWorker({
      prefix,
      concurrency: 2,
      limiter: { max: 50, duration: 1000 },
      deliver: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 200));
        inFlight -= 1;
        return { messageId: 'ok' };
      },
    });
    workers.push(worker);

    for (const email of emails) {
      await queue.add('send-email', { emailId: email.id }, { jobId: email.id });
    }

    await waitUntil('all sent', async () => {
      const rows = await prisma.email.findMany({ where: { id: { in: emails.map((item) => item.id) } } });
      return rows.every((row) => row.status === EmailStatus.SENT);
    });

    assert.equal(maxInFlight, 2);
  });

  it('applies the BullMQ limiter so jobs do not all start at once', async () => {
    const owner = await createTestUser('rate-owner');
    createdUserIds.push(owner.user.id);
    const prefix = testPrefix();
    const queue = isolatedQueue(prefix);
    const emails = await Promise.all([
      insertQueued(owner.user.id),
      insertQueued(owner.user.id),
      insertQueued(owner.user.id),
    ]);

    const startedAt: number[] = [];
    const worker = createEmailWorker({
      prefix,
      concurrency: 5,
      limiter: { max: 1, duration: 400 },
      deliver: async () => {
        startedAt.push(Date.now());
        return { messageId: 'ok' };
      },
    });
    workers.push(worker);

    for (const email of emails) {
      await queue.add('send-email', { emailId: email.id }, { jobId: email.id });
    }

    await waitUntil('rate-limited sends', async () => startedAt.length === 3);

    const gaps = [startedAt[1]! - startedAt[0]!, startedAt[2]! - startedAt[1]!];
    assert.ok(gaps[0] >= 300, `expected limiter gap, got ${gaps[0]}ms`);
    assert.ok(gaps[1] >= 300, `expected limiter gap, got ${gaps[1]}ms`);
  });

  it('keeps retries subject to the same worker limiter', async () => {
    const owner = await createTestUser('retry-owner');
    createdUserIds.push(owner.user.id);
    const prefix = testPrefix();
    const queue = isolatedQueue(prefix);
    const email = await insertQueued(owner.user.id);

    let attempts = 0;
    const startedAt: number[] = [];
    const worker = createEmailWorker({
      prefix,
      concurrency: 2,
      limiter: { max: 1, duration: 250 },
      deliver: async () => {
        attempts += 1;
        startedAt.push(Date.now());
        if (attempts === 1) {
          throw new RetryableJobError('temporary smtp');
        }
        return { messageId: 'retried-ok' };
      },
    });
    workers.push(worker);

    await queue.add(
      'send-email',
      { emailId: email.id },
      { jobId: email.id, attempts: 3, backoff: { type: 'fixed', delay: 80 } },
    );

    await waitUntil('retry sent', async () => {
      const stored = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
      return stored.status === EmailStatus.SENT;
    });

    assert.equal(attempts, 2);
    assert.ok(startedAt[1]! - startedAt[0]! >= 200);
  });

  it('does not enqueue a duplicate while a PROCESSING job is active', async () => {
    const owner = await createTestUser('active-owner');
    createdUserIds.push(owner.user.id);
    const prefix = testPrefix();
    const queue = isolatedQueue(prefix);
    const email = await insertQueued(owner.user.id);

    let entered = false;
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });

    const worker = createEmailWorker({
      prefix,
      concurrency: 1,
      limiter: { max: 10, duration: 1000 },
      deliver: async () => {
        entered = true;
        await gate;
        return { messageId: 'active-ok' };
      },
    });
    workers.push(worker);

    await queue.add('send-email', { emailId: email.id }, { jobId: email.id });
    await waitUntil('processor entered', async () => entered);

    const during = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    assert.equal(during.status, EmailStatus.PROCESSING);

    const summary = await reconcileEmailQueue({
      queue,
      emailIds: [email.id],
      processingTimeoutMs: 1,
    });

    assert.equal(summary.processingSkippedActive, 1);
    const counts = await queue.getJobCounts('waiting', 'delayed', 'paused', 'prioritized', 'active');
    assert.equal(counts.active, 1);
    assert.equal((counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.paused ?? 0), 0);

    const still = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    assert.equal(still.status, EmailStatus.PROCESSING);

    unblock();
    await waitUntil('active send finished', async () => {
      const stored = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
      return stored.status === EmailStatus.SENT;
    });
  });
});
