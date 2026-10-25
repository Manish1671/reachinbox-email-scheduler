import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getQueueDashboardPath } from './queue-dashboard';

describe('queue dashboard', () => {
  it('mounts under the protected API prefix', () => {
    assert.equal(getQueueDashboardPath(), '/api/admin/queues');
  });
});
