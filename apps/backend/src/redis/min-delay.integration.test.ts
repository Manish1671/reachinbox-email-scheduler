/**
 * Requires Redis at REDIS_URL (integration).
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { redis } from '../queue/redis';
import {
  acquireCampaignMinDelaySlot,
  campaignMinDelayKey,
  getCampaignMinDelayWaitMs,
} from './min-delay';

describe('campaign min delay (requires Redis)', () => {
  const campaignId = randomUUID();
  const key = campaignMinDelayKey(campaignId);

  after(async () => {
    await redis.del(key);
  });

  it('acquires atomically so only one concurrent worker passes', async () => {
    const minDelayMs = 5_000;
    const nowMs = Date.now();

    const [first, second] = await Promise.all([
      acquireCampaignMinDelaySlot(redis, campaignId, minDelayMs, nowMs),
      acquireCampaignMinDelaySlot(redis, campaignId, minDelayMs, nowMs),
    ]);

    const passes = [first, second].filter((wait) => wait === 0).length;
    assert.equal(passes, 1);
    assert.equal(first === 0 || second === 0, true);
    assert.ok(first > 0 || second > 0);
  });

  it('peek does not claim a slot', async () => {
    await redis.del(key);
    const minDelayMs = 1_000;
    const base = Date.now();
    assert.equal(await acquireCampaignMinDelaySlot(redis, campaignId, minDelayMs, base), 0);
    const peek = await getCampaignMinDelayWaitMs(redis, campaignId, minDelayMs, base + 100);
    assert.ok(peek > 0);
  });
});
