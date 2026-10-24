import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { EmailStatus } from '@prisma/client';
import { closeEmailQueue, getEmailQueue } from '../queue/email.queue';
import type { PublicEmail } from '../types/email';
import {
  apiRequest,
  createTestUser,
  deleteUsers,
  futureIso,
  pastIso,
  startTestServer,
} from '../test/helpers';

const createdUserIds: string[] = [];
const createdEmailIds: string[] = [];
const { server, baseUrl } = startTestServer();

after(async () => {
  for (const emailId of createdEmailIds) {
    const job = await getEmailQueue().getJob(emailId);
    if (job) {
      await job.remove();
    }
  }
  await deleteUsers(createdUserIds);
  await closeEmailQueue();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
    server.closeAllConnections();
  });
});

describe('email HTTP API', () => {
  it('rejects unauthenticated create requests', async () => {
    const response = await apiRequest(baseUrl, 'POST', '/api/emails', {
      body: {
        recipient: 'test@example.com',
        subject: 'Hello',
        body: 'Body',
        scheduledAt: futureIso(),
      },
    });
    assert.equal(response.status, 401);
  });

  it('creates an email from the JWT user rather than a client-supplied userId', async () => {
    const owner = await createTestUser('http-owner');
    const other = await createTestUser('http-other');
    createdUserIds.push(owner.user.id, other.user.id);

    const response = await apiRequest<PublicEmail>(baseUrl, 'POST', '/api/emails', {
      token: owner.token,
      body: {
        recipient: 'recipient@example.com',
        subject: 'Hello',
        body: 'This is a test email',
        scheduledAt: futureIso(),
        userId: other.user.id,
      },
    });

    assert.equal(response.status, 201);
    const created = response.json.data;
    assert.ok(created);
    createdEmailIds.push(created.id);
    assert.equal(created.status, EmailStatus.QUEUED);

    const fetched = await apiRequest<PublicEmail>(baseUrl, 'GET', `/api/emails/${created.id}`, {
      token: owner.token,
    });
    assert.equal(fetched.status, 200);
    assert.equal(fetched.json.data?.id, created.id);

    const stolen = await apiRequest(baseUrl, 'GET', `/api/emails/${created.id}`, {
      token: other.token,
    });
    assert.equal(stolen.status, 404);
  });

  it('rejects invalid payloads and past schedule times', async () => {
    const owner = await createTestUser('http-validate');
    createdUserIds.push(owner.user.id);

    const invalidRecipient = await apiRequest(baseUrl, 'POST', '/api/emails', {
      token: owner.token,
      body: {
        recipient: 'not-an-email',
        subject: 'Hello',
        body: 'Body',
        scheduledAt: futureIso(),
      },
    });
    assert.equal(invalidRecipient.status, 400);

    const missingSubject = await apiRequest(baseUrl, 'POST', '/api/emails', {
      token: owner.token,
      body: {
        recipient: 'test@example.com',
        body: 'Body',
        scheduledAt: futureIso(),
      },
    });
    assert.equal(missingSubject.status, 400);

    const missingBody = await apiRequest(baseUrl, 'POST', '/api/emails', {
      token: owner.token,
      body: {
        recipient: 'test@example.com',
        subject: 'Hello',
        scheduledAt: futureIso(),
      },
    });
    assert.equal(missingBody.status, 400);

    const invalidDate = await apiRequest(baseUrl, 'POST', '/api/emails', {
      token: owner.token,
      body: {
        recipient: 'test@example.com',
        subject: 'Hello',
        body: 'Body',
        scheduledAt: 'not-a-date',
      },
    });
    assert.equal(invalidDate.status, 400);

    const past = await apiRequest(baseUrl, 'POST', '/api/emails', {
      token: owner.token,
      body: {
        recipient: 'test@example.com',
        subject: 'Hello',
        body: 'Body',
        scheduledAt: pastIso(),
      },
    });
    assert.equal(past.status, 400);
    assert.equal(past.json.error?.code, 'INVALID_SCHEDULE_TIME');
  });

  it('lists current-user emails through scheduled and sent endpoints', async () => {
    const owner = await createTestUser('http-list');
    createdUserIds.push(owner.user.id);

    const created = await apiRequest<PublicEmail>(baseUrl, 'POST', '/api/emails', {
      token: owner.token,
      body: {
        recipient: 'recipient@example.com',
        subject: 'Hello',
        body: 'Body',
        scheduledAt: futureIso(),
      },
    });
    assert.equal(created.status, 201);
    const email = created.json.data;
    assert.ok(email);
    createdEmailIds.push(email.id);

    const all = await apiRequest<PublicEmail[]>(baseUrl, 'GET', '/api/emails', { token: owner.token });
    assert.equal(all.status, 200);
    assert.equal(all.json.data?.some((item) => item.id === email.id), true);

    const queued = await apiRequest<PublicEmail[]>(baseUrl, 'GET', '/api/emails?status=QUEUED', {
      token: owner.token,
    });
    assert.equal(queued.status, 200);
    assert.equal(queued.json.data?.every((item) => item.status === 'QUEUED'), true);

    const scheduled = await apiRequest<PublicEmail[]>(baseUrl, 'GET', '/api/emails/scheduled', {
      token: owner.token,
    });
    assert.equal(scheduled.status, 200);
    assert.equal(scheduled.json.data?.some((item) => item.id === email.id), true);

    const sent = await apiRequest<PublicEmail[]>(baseUrl, 'GET', '/api/emails/sent', {
      token: owner.token,
    });
    assert.equal(sent.status, 200);
    assert.equal(sent.json.data?.some((item) => item.id === email.id), false);
  });
});
