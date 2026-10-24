import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { prisma } from '../db/prisma';
import * as emailQueue from '../queue/email.queue';
import { apiRequest, createTestUser, deleteUsers, futureIso, startTestServer } from '../test/helpers';

const createdUserIds: string[] = [];

after(async () => {
  await deleteUsers(createdUserIds);
  await emailQueue.closeEmailQueue();
});

describe('campaign HTTP API', () => {
  it('rejects unauthenticated campaign creation', async () => {
    const { server, baseUrl } = startTestServer();
    const response = await apiRequest(baseUrl, 'POST', '/api/campaigns', {
      body: {
        subject: 'Hello',
        body: 'Body',
        startAt: futureIso(),
        minDelayMs: 0,
        hourlyQuota: 10,
        recipients: 'a@example.com',
      },
    });
    server.close();
    assert.equal(response.status, 401);
  });

  it('creates a campaign and returns the server-detected recipient count', async () => {
    const owner = await createTestUser('campaign-http');
    createdUserIds.push(owner.user.id);
    const { server, baseUrl } = startTestServer();

    const response = await apiRequest(baseUrl, 'POST', '/api/campaigns', {
      token: owner.token,
      body: {
        subject: 'Bulk hello',
        body: 'Message body',
        startAt: futureIso(3 * 60 * 60 * 1000),
        minDelayMs: 1_000,
        hourlyQuota: 25,
        recipients: 'one@example.com\none@example.com\ntwo@example.com',
      },
    });

    server.close();
    assert.equal(response.status, 201);
    assert.equal(response.json.success, true);
    assert.equal(response.json.data?.recipientCount, 2);
    assert.equal(response.json.data?.stats.total, 2);

    const campaignId = response.json.data?.id as string;
    const emails = await prisma.email.findMany({
      where: { campaignId },
      select: { id: true },
    });
    for (const email of emails) {
      const job = await emailQueue.getEmailQueue().getJob(email.id);
      if (job) {
        await job.remove();
      }
    }
  });
});
