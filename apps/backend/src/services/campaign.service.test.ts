import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { CampaignStatus, EmailStatus } from '@prisma/client';
import { prisma } from '../db/prisma';
import * as emailQueue from '../queue/email.queue';
import { AppError } from '../utils/app-error';
import { calculateStaggeredScheduledAt } from '../utils/campaign-schedule';
import { createCampaign, getOwnedCampaign } from './campaign.service';
import { createTestUser, deleteUsers, futureIso } from '../test/helpers';

const createdUserIds: string[] = [];
const createdCampaignIds: string[] = [];

after(async () => {
  for (const campaignId of createdCampaignIds) {
    const emails = await prisma.email.findMany({ where: { campaignId }, select: { id: true } });
    for (const email of emails) {
      const job = await emailQueue.getEmailQueue().getJob(email.id);
      if (job) {
        await job.remove();
      }
    }
  }
  await deleteUsers(createdUserIds);
  await emailQueue.closeEmailQueue();
});

describe('campaignService', () => {
  it('creates a campaign, persists staggered emails, and enqueues deterministic jobs', async () => {
    const owner = await createTestUser('campaign-create');
    createdUserIds.push(owner.user.id);

    const startAt = new Date(futureIso(3 * 60 * 60 * 1000));
    const created = await createCampaign(owner.user.id, {
      subject: 'Campaign subject',
      body: 'Campaign body',
      startAt,
      minDelayMs: 2_000,
      hourlyQuota: 50,
      recipients: 'one@example.com\ntwo@example.com',
      idempotencyKey: `key-${Date.now()}`,
    });
    createdCampaignIds.push(created.id);

    assert.equal(created.recipientCount, 2);
    assert.equal(created.stats.total, 2);
    assert.equal(created.stats.queued, 2);
    assert.equal(created.status, CampaignStatus.QUEUED);

    const emails = await prisma.email.findMany({
      where: { campaignId: created.id },
      orderBy: { sequenceIndex: 'asc' },
    });
    assert.equal(emails.length, 2);
    assert.equal(emails[0]?.scheduledAt.toISOString(), startAt.toISOString());
    assert.equal(
      emails[1]?.scheduledAt.toISOString(),
      calculateStaggeredScheduledAt(startAt, 1, 2_000).toISOString(),
    );

    for (const email of emails) {
      const job = await emailQueue.getEmailQueue().getJob(email.id);
      assert.ok(job);
      assert.equal(job.id, email.id);
      assert.equal(email.status, EmailStatus.QUEUED);
    }
  });

  it('returns the existing campaign for repeated idempotency keys without duplicating rows', async () => {
    const owner = await createTestUser('campaign-idempotent');
    createdUserIds.push(owner.user.id);
    const idempotencyKey = `idem-${Date.now()}`;
    const startAt = new Date(futureIso(4 * 60 * 60 * 1000));

    const first = await createCampaign(owner.user.id, {
      subject: 'Subject',
      body: 'Body',
      startAt,
      minDelayMs: 1_000,
      hourlyQuota: 10,
      recipients: 'repeat@example.com',
      idempotencyKey,
    });
    createdCampaignIds.push(first.id);

    const second = await createCampaign(owner.user.id, {
      subject: 'Different subject',
      body: 'Different body',
      startAt,
      minDelayMs: 1_000,
      hourlyQuota: 10,
      recipients: 'ignored-on-replay@example.com',
      idempotencyKey,
    });

    assert.equal(second.id, first.id);
    assert.equal(second.idempotentReplay, true);

    const count = await prisma.email.count({ where: { campaignId: first.id } });
    assert.equal(count, 1);
    assert.equal(second.recipientCount, 1);
  });

  it('leaves campaign emails SCHEDULED when enqueue fails and can be recovered', async () => {
    const owner = await createTestUser('campaign-queue-fail');
    createdUserIds.push(owner.user.id);
    const startAt = new Date(futureIso(2 * 60 * 60 * 1000));

    await assert.rejects(
      () =>
        createCampaign(
          owner.user.id,
          {
            subject: 'Subject',
            body: 'Body',
            startAt,
            minDelayMs: 0,
            hourlyQuota: 100,
            recipients: 'queue-fail@example.com',
          },
          async () => {
            throw new Error('redis unavailable');
          },
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === 'QUEUE_ENQUEUE_FAILED' && error.statusCode === 503,
    );

    const campaign = await prisma.emailCampaign.findFirstOrThrow({
      where: { userId: owner.user.id },
    });
    createdCampaignIds.push(campaign.id);

    const email = await prisma.email.findFirstOrThrow({ where: { campaignId: campaign.id } });
    assert.equal(email.status, EmailStatus.SCHEDULED);
    assert.equal(campaign.status, CampaignStatus.SCHEDULED);
  });

  it('scopes campaign reads to the authenticated owner', async () => {
    const ownerA = await createTestUser('campaign-owner-a');
    const ownerB = await createTestUser('campaign-owner-b');
    createdUserIds.push(ownerA.user.id, ownerB.user.id);

    const created = await createCampaign(ownerA.user.id, {
      subject: 'Private',
      body: 'Body',
      startAt: new Date(futureIso()),
      minDelayMs: 0,
      hourlyQuota: 5,
      recipients: 'private@example.com',
    });
    createdCampaignIds.push(created.id);

    await assert.rejects(
      () => getOwnedCampaign(created.id, ownerB.user.id),
      (error: unknown) =>
        error instanceof AppError && error.code === 'CAMPAIGN_NOT_FOUND' && error.statusCode === 404,
    );
  });
});
