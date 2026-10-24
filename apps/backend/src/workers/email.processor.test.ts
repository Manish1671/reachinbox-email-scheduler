import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { EmailStatus } from '@prisma/client';
import { prisma } from '../db/prisma';
import { EMAIL_JOB_ATTEMPTS } from '../config/constants';
import { createTestUser, deleteUsers, futureIso } from '../test/helpers';
import type { DeliveryMessage } from '../services/email-delivery.service';
import { PermanentJobError, RetryableJobError } from '../utils/job-errors';
import { processSendEmailJob, type SendEmailJobLike } from './email.processor';

const createdUserIds: string[] = [];

after(async () => {
  await deleteUsers(createdUserIds);
});

function jobFor(emailId: string, extras: Partial<SendEmailJobLike> = {}): SendEmailJobLike {
  return {
    id: emailId,
    name: 'send-email',
    data: { emailId },
    attemptsMade: 0,
    opts: { attempts: EMAIL_JOB_ATTEMPTS },
    ...extras,
  };
}

async function insertEmail(
  userId: string,
  status: EmailStatus,
  fields?: { recipient?: string; subject?: string; body?: string },
) {
  return prisma.email.create({
    data: {
      userId,
      recipient: fields?.recipient ?? 'recipient@example.com',
      subject: fields?.subject ?? 'Original subject',
      body: fields?.body ?? 'Original body',
      scheduledAt: new Date(futureIso()),
      status,
    },
  });
}

describe('processSendEmailJob', () => {
  it('loads the PostgreSQL record and sends only database content', async () => {
    const owner = await createTestUser('proc-content');
    createdUserIds.push(owner.user.id);
    const email = await insertEmail(owner.user.id, EmailStatus.QUEUED, {
      recipient: 'db-recipient@example.com',
      subject: 'DB subject',
      body: 'DB body',
    });

    const sent: DeliveryMessage[] = [];
    await processSendEmailJob(
      {
        ...jobFor(email.id),
        data: {
          emailId: email.id,
          recipient: 'attacker@evil.example',
          subject: 'Forged subject',
          body: 'Forged body',
        },
      },
      async (message) => {
        sent.push(message);
        return { messageId: '<ok@ethereal.email>' };
      },
    );

    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], {
      recipient: 'db-recipient@example.com',
      subject: 'DB subject',
      body: 'DB body',
    });

    const stored = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    assert.equal(stored.status, EmailStatus.SENT);
    assert.ok(stored.sentAt);
    assert.equal(stored.providerMessageId, '<ok@ethereal.email>');
  });

  it('claims QUEUED then SENT after a successful send', async () => {
    const owner = await createTestUser('proc-success');
    createdUserIds.push(owner.user.id);
    const email = await insertEmail(owner.user.id, EmailStatus.QUEUED);
    const statuses: EmailStatus[] = [];

    await processSendEmailJob(jobFor(email.id), async () => {
      const current = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
      statuses.push(current.status);
      return { messageId: 'msg-1' };
    });

    assert.deepEqual(statuses, [EmailStatus.PROCESSING]);
    const stored = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    assert.equal(stored.status, EmailStatus.SENT);
  });

  it('does not send an already SENT email again', async () => {
    const owner = await createTestUser('proc-sent');
    createdUserIds.push(owner.user.id);
    const email = await insertEmail(owner.user.id, EmailStatus.SENT);
    await prisma.email.update({
      where: { id: email.id },
      data: { sentAt: new Date(), providerMessageId: 'original' },
    });

    let sendCalls = 0;
    await processSendEmailJob(jobFor(email.id), async () => {
      sendCalls += 1;
      return { messageId: 'should-not-send' };
    });

    assert.equal(sendCalls, 0);
    const stored = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    assert.equal(stored.status, EmailStatus.SENT);
    assert.equal(stored.providerMessageId, 'original');
  });

  it('does not send when another worker already claimed PROCESSING', async () => {
    const owner = await createTestUser('proc-processing');
    createdUserIds.push(owner.user.id);
    const email = await insertEmail(owner.user.id, EmailStatus.PROCESSING);

    let sendCalls = 0;
    await processSendEmailJob(jobFor(email.id), async () => {
      sendCalls += 1;
      return { messageId: 'nope' };
    });

    assert.equal(sendCalls, 0);
    const stored = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    assert.equal(stored.status, EmailStatus.PROCESSING);
  });

  it('fails permanently when the email record is missing', async () => {
    let sendCalls = 0;
    await assert.rejects(
      () =>
        processSendEmailJob(jobFor(randomUUID()), async () => {
          sendCalls += 1;
          return {};
        }),
      (error: unknown) => error instanceof PermanentJobError,
    );
    assert.equal(sendCalls, 0);
  });

  it('fails permanently on a malformed payload', async () => {
    let sendCalls = 0;
    await assert.rejects(
      () =>
        processSendEmailJob(
          { id: 'bad', name: 'send-email', data: { recipient: 'x@y.com' }, attemptsMade: 0, opts: { attempts: 3 } },
          async () => {
            sendCalls += 1;
            return {};
          },
        ),
      (error: unknown) => error instanceof PermanentJobError,
    );
    assert.equal(sendCalls, 0);
  });

  it('does not mark SENT when sending fails', async () => {
    const owner = await createTestUser('proc-fail');
    createdUserIds.push(owner.user.id);
    const email = await insertEmail(owner.user.id, EmailStatus.QUEUED);

    await assert.rejects(
      () =>
        processSendEmailJob(jobFor(email.id), async () => {
          throw new RetryableJobError('SMTP 421 try again');
        }),
      (error: unknown) => error instanceof RetryableJobError,
    );

    const stored = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    assert.equal(stored.status, EmailStatus.QUEUED);
    assert.equal(stored.sentAt, null);
  });

  it('releases to QUEUED on a retryable failure and marks FAILED on the last attempt', async () => {
    const owner = await createTestUser('proc-retry');
    createdUserIds.push(owner.user.id);
    const email = await insertEmail(owner.user.id, EmailStatus.QUEUED);

    await assert.rejects(
      () =>
        processSendEmailJob(jobFor(email.id, { attemptsMade: 0 }), async () => {
          throw new RetryableJobError('temporary');
        }),
      RetryableJobError,
    );
    assert.equal((await prisma.email.findUniqueOrThrow({ where: { id: email.id } })).status, EmailStatus.QUEUED);

    await assert.rejects(
      () =>
        processSendEmailJob(jobFor(email.id, { attemptsMade: EMAIL_JOB_ATTEMPTS - 1 }), async () => {
          throw new RetryableJobError('still failing');
        }),
      PermanentJobError,
    );

    const stored = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    assert.equal(stored.status, EmailStatus.FAILED);
    assert.equal(stored.failureReason, 'still failing');
    assert.equal(stored.sentAt, null);
  });

  it('marks FAILED without retrying a permanent configuration error', async () => {
    const owner = await createTestUser('proc-permanent');
    createdUserIds.push(owner.user.id);
    const email = await insertEmail(owner.user.id, EmailStatus.QUEUED);

    await assert.rejects(
      () =>
        processSendEmailJob(jobFor(email.id, { attemptsMade: 0 }), async () => {
          throw new PermanentJobError('Ethereal credentials are not configured');
        }),
      PermanentJobError,
    );

    const stored = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    assert.equal(stored.status, EmailStatus.FAILED);
    assert.match(stored.failureReason ?? '', /Ethereal credentials/);
  });
});
