import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { EmailStatus } from '@prisma/client';
import { prisma } from '../db/prisma';
import * as emailQueue from '../queue/email.queue';
import { AppError } from '../utils/app-error';
import {
  createScheduledEmail,
  getOwnedEmail,
  listEmailsForUser,
  listScheduledEmailsForUser,
  listSentEmailsForUser,
} from './email.service';
import { createTestUser, deleteUsers, futureIso, pastIso } from '../test/helpers';

const createdUserIds: string[] = [];
const createdEmailIds: string[] = [];

after(async () => {
  for (const emailId of createdEmailIds) {
    const job = await emailQueue.getEmailQueue().getJob(emailId);
    if (job) {
      await job.remove();
    }
  }
  await deleteUsers(createdUserIds);
  await emailQueue.closeEmailQueue();
});

describe('emailService', () => {
  it('creates a scheduled email owned by the authenticated user and enqueues a delayed job', async () => {
    const owner = await createTestUser('owner-create');
    createdUserIds.push(owner.user.id);

    const scheduledAt = new Date(futureIso(2 * 60 * 60 * 1000));
    const beforeEnqueue = Date.now();
    const created = await createScheduledEmail(owner.user.id, {
      recipient: 'recipient@example.com',
      subject: 'Hello',
      body: 'This is a test email',
      scheduledAt,
    });
    createdEmailIds.push(created.id);

    assert.equal(created.status, EmailStatus.QUEUED);
    assert.equal(created.recipient, 'recipient@example.com');
    assert.equal(created.scheduledAt, scheduledAt.toISOString());

    const stored = await prisma.email.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(stored.userId, owner.user.id);
    assert.equal(stored.status, EmailStatus.QUEUED);

    const job = await emailQueue.getEmailQueue().getJob(created.id);
    assert.ok(job);
    assert.equal(job.id, created.id);
    assert.equal(job.name, 'send-email');
    assert.deepEqual(job.data, { emailId: created.id });
    assert.equal(job.opts.attempts, 3);

    const expectedDelay = scheduledAt.getTime() - beforeEnqueue;
    assert.ok(job.opts.delay !== undefined);
    assert.ok(Math.abs((job.opts.delay ?? 0) - expectedDelay) < 5000);
    assert.ok((job.opts.delay ?? 0) > 60 * 60 * 1000);
  });

  it('rejects a past scheduledAt with INVALID_SCHEDULE_TIME', async () => {
    const owner = await createTestUser('owner-past');
    createdUserIds.push(owner.user.id);

    await assert.rejects(
      () =>
        createScheduledEmail(owner.user.id, {
          recipient: 'recipient@example.com',
          subject: 'Hello',
          body: 'Body',
          scheduledAt: new Date(pastIso()),
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === 'INVALID_SCHEDULE_TIME' && error.statusCode === 400,
    );
  });

  it('leaves the email SCHEDULED when BullMQ enqueue fails', async () => {
    const owner = await createTestUser('owner-queue-fail');
    createdUserIds.push(owner.user.id);

    await assert.rejects(
      () =>
        createScheduledEmail(
          owner.user.id,
          {
            recipient: 'recipient@example.com',
            subject: 'Hello',
            body: 'Body',
            scheduledAt: new Date(futureIso()),
          },
          async () => {
            throw new Error('redis unavailable');
          },
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === 'QUEUE_ENQUEUE_FAILED' && error.statusCode === 503,
    );

    const leftover = await prisma.email.findMany({
      where: { userId: owner.user.id },
    });
    assert.equal(leftover.length, 1);
    const email = leftover[0];
    assert.ok(email);
    assert.equal(email.status, EmailStatus.SCHEDULED);
    assert.notEqual(email.status, EmailStatus.SENT);
    assert.notEqual(email.status, EmailStatus.FAILED);
  });

  it('lists only the current user emails and hides another user email by id', async () => {
    const userA = await createTestUser('list-a');
    const userB = await createTestUser('list-b');
    createdUserIds.push(userA.user.id, userB.user.id);

    const emailA = await createScheduledEmail(userA.user.id, {
      recipient: 'a@example.com',
      subject: 'A',
      body: 'A body',
      scheduledAt: new Date(futureIso()),
    });
    const emailB = await createScheduledEmail(userB.user.id, {
      recipient: 'b@example.com',
      subject: 'B',
      body: 'B body',
      scheduledAt: new Date(futureIso()),
    });
    createdEmailIds.push(emailA.id, emailB.id);

    const listA = await listEmailsForUser(userA.user.id);
    assert.equal(listA.some((email) => email.id === emailA.id), true);
    assert.equal(listA.some((email) => email.id === emailB.id), false);

    const scheduledA = await listScheduledEmailsForUser(userA.user.id);
    assert.equal(scheduledA.every((email) => email.status === 'SCHEDULED' || email.status === 'QUEUED'), true);
    assert.equal(scheduledA.some((email) => email.id === emailA.id), true);

    const sentA = await listSentEmailsForUser(userA.user.id);
    assert.equal(sentA.length, 0);

    const owned = await getOwnedEmail(emailA.id, userA.user.id);
    assert.equal(owned.id, emailA.id);

    await assert.rejects(
      () => getOwnedEmail(emailB.id, userA.user.id),
      (error: unknown) => error instanceof AppError && error.statusCode === 404,
    );
  });
});
