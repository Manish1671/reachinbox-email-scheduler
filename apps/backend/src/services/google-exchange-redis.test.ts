import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { redis } from '../queue/redis';

describe('google exchange redis keys', () => {
  it('consumes exchange codes atomically with GETDEL', async () => {
    const code = `exchange-atomic-${Date.now()}`;
    const key = `google:exchange:${code}`;
    await redis.set(key, JSON.stringify({ userId: 'user-1' }), 'EX', 60);

    const first = await redis.getdel(key);
    assert.ok(first);
    const second = await redis.getdel(key);
    assert.equal(second, null);
  });
});
