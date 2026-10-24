import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { EmailStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { prisma } from '../db/prisma';
import { createEmailQueue, getEmailJob, getEmailJobState } from '../queue/email.queue';
import { reconcileEmailQueue } from './email-reconciliation.service';
import { createTestUser, deleteUsers, futureIso, pastIso } from '../test/helpers';

const createdUserIds: string[] = [];
const queues: Queue[] = [];

after(async () => {
  for (const queue of queues) {
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
  }
  await deleteUsers(createdUserIds);
});

function isolatedQueue(): Queue {
  const queue = createEmailQueue({ prefix: `{recon-${randomUUID()}}` });
  queues.push(queue);
  return queue;
}

async function insertEmail(
  userId: string,
  status: EmailStatus,
  scheduledAt: Date,
) {
  return prisma.email.create({
    data: {
      userId,
      recipient: 'recipient@example.com',
      subject: 'Reconcile',
      body: 'Body',
      scheduledAt,
      status,
    },
  });
}

async function setUpdatedAt(emailId: string, updatedAt: Date): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Email" SET "updatedAt" = ${updatedAt} WHERE id = ${emailId}
  `;
}

describe('email reconciliation', () => {
  it('recreates a missing job for a SCHEDULED email and marks it QUEUED', async () => {
    const owner = await createTestUser('recon-scheduled');
    createdUserIds.push(owner.user.id);
    const queue = isolatedQueue();
    const scheduledAt = new Date(futureIso(10 * 60 * 1000));
    const email = await insertEmail(owner.user.id, EmailStatus.SCHEDULED, scheduledAt);

    const summary = await reconcileEmailQueue({
      queue,
      emailIds: [email.id],
    });

    const stored = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    const job = await getEmailJob(email.id, queue);

    assert.equal(summary.scheduledRecovered, 1);
    assert.equal(stored.status, EmailStatus.QUEUED);
    assert.ok(job);
    assert.equal(job.id, email.id);
    assert.deepEqual(job.data, { emailId: email.id });
    assert.ok((job.opts.delay ?? 0) > 60_000);
  });

  it('enqueues an immediately eligible job when a SCHEDULED email is already due', async () => {
    const owner = await createTestUser('recon-due');
    createdUserIds.push(owner.user.id);
    const queue = isolatedQueue();
    const email = await insertEmail(owner.user.id, EmailStatus.SCHEDULED, new Date(pastIso(5_000)));

    await reconcileEmailQueue({ queue, emailIds: [email.id] });

    const stored = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    const job = await getEmailJob(email.id, queue);
    assert.equal(stored.status, EmailStatus.QUEUED);
    assert.ok(job);
    assert.equal(job.opts.delay ?? 0, 0);
  });

  it('recreates a missing job for a QUEUED email without changing status', async () => {
    const owner = await createTestUser('recon-queued');
    createdUserIds.push(owner.user.id);
    const queue = isolatedQueue();
    const email = await insertEmail(owner.user.id, EmailStatus.QUEUED, new Date(futureIso()));

    await reconcileEmailQueue({ queue, emailIds: [email.id] });

    const stored = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    assert.equal(stored.status, EmailStatus.QUEUED);
    assert.equal(await getEmailJobState(email.id, queue) === 'missing', false);
  });

  it('releases a stale PROCESSING email and re-enqueues it', async () => {
    const owner = await createTestUser('recon-stale');
    createdUserIds.push(owner.user.id);
    const queue = isolatedQueue();
    const email = await insertEmail(owner.user.id, EmailStatus.PROCESSING, new Date(futureIso()));
    await setUpdatedAt(email.id, new Date(Date.now() - 10 * 60 * 1000));

    await reconcileEmailQueue({
      queue,
      emailIds: [email.id],
      processingTimeoutMs: 1_000,
    });

    const stored = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    assert.equal(stored.status, EmailStatus.QUEUED);
    assert.ok(await getEmailJob(email.id, queue));
  });

  it('does not create a second job when PROCESSING is backed by a live delayed job', async () => {
    const owner = await createTestUser('recon-live');
    createdUserIds.push(owner.user.id);
    const queue = isolatedQueue();
    const email = await insertEmail(owner.user.id, EmailStatus.PROCESSING, new Date(futureIso()));
    await queue.add('send-email', { emailId: email.id }, { jobId: email.id, delay: 60_000 });
    await setUpdatedAt(email.id, new Date(Date.now() - 10 * 60 * 1000));

    const before = await getEmailJob(email.id, queue);
    await reconcileEmailQueue({
      queue,
      emailIds: [email.id],
      processingTimeoutMs: 1_000,
    });

    const stored = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    const after = await getEmailJob(email.id, queue);
    assert.equal(stored.status, EmailStatus.QUEUED);
    assert.ok(before);
    assert.ok(after);
    assert.equal(after.id, before.id);
  });

  it('is idempotent because jobId equals email.id', async () => {
    const owner = await createTestUser('recon-idemp');
    createdUserIds.push(owner.user.id);
    const queue = isolatedQueue();
    const email = await insertEmail(owner.user.id, EmailStatus.QUEUED, new Date(futureIso()));

    await reconcileEmailQueue({ queue, emailIds: [email.id] });
    await reconcileEmailQueue({ queue, emailIds: [email.id] });

    const counts = await queue.getJobCounts('waiting', 'delayed', 'paused', 'prioritized', 'active');
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    assert.equal(total, 1);
    assert.equal((await getEmailJob(email.id, queue))?.id, email.id);
  });

  it('removes leftover queue jobs for SENT emails and does not create a replacement', async () => {
    const owner = await createTestUser('recon-sent');
    createdUserIds.push(owner.user.id);
    const queue = isolatedQueue();
    const email = await insertEmail(owner.user.id, EmailStatus.SENT, new Date(futureIso()));
    await prisma.email.update({
      where: { id: email.id },
      data: { sentAt: new Date(), providerMessageId: 'already-sent' },
    });
    await queue.add('send-email', { emailId: email.id }, { jobId: email.id, delay: 5_000 });

    const summary = await reconcileEmailQueue({ queue, emailIds: [email.id] });
    assert.equal(summary.sentJobsRemoved, 1);
    assert.equal(await getEmailJobState(email.id, queue), 'missing');
    const stored = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    assert.equal(stored.status, EmailStatus.SENT);
  });
});
