import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { closeEmailQueue } from '../queue/email.queue';
import {
  apiRequest,
  createTestUser,
  deleteUsers,
  startTestServer,
} from '../test/helpers';

const createdUserIds: string[] = [];
const { server, baseUrl } = startTestServer();

after(async () => {
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

describe('queue dashboard HTTP', () => {
  it('rejects unauthenticated access to Bull Board', async () => {
    const response = await fetch(`${baseUrl}/api/admin/queues`, {
      headers: { Connection: 'close' },
    });
    assert.equal(response.status, 401);
    await response.text();
  });

  it('allows an authenticated user to create a dashboard session cookie', async () => {
    const owner = await createTestUser('queue-dashboard');
    createdUserIds.push(owner.user.id);

    const response = await apiRequest(baseUrl, 'POST', '/api/admin/queues/session', {
      token: owner.token,
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.success, true);
    assert.equal(response.json.data?.path, '/api/admin/queues');
  });
});
