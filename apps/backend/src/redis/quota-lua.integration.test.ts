/**
 * Requires Redis at REDIS_URL (integration).
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { redis } from '../queue/redis';
import {
  confirmHourlyQuotaReservation,
  releaseHourlyQuotaReservation,
  reserveHourlyQuota,
} from './quota-lua';
import { campaignQuotaCounterKey, getUtcHourBucket } from './quota-hour';

const keysToDelete: string[] = [];

after(async () => {
  if (keysToDelete.length > 0) {
    await redis.del(...keysToDelete);
  }
});

describe('hourly quota lua (requires Redis)', () => {
  it('reserves atomically and releases failed reservations without counting sends', async () => {
    const campaignId = randomUUID();
    const emailId = randomUUID();
    const hour = getUtcHourBucket();
    keysToDelete.push(campaignQuotaCounterKey(campaignId, hour));

    const first = await reserveHourlyQuota(redis, 'campaign', campaignId, emailId, 1);
    assert.equal(first.ok, true);

    const second = await reserveHourlyQuota(redis, 'campaign', campaignId, randomUUID(), 1);
    assert.equal(second.ok, false);

    await releaseHourlyQuotaReservation(redis, 'campaign', campaignId, emailId);

    const third = await reserveHourlyQuota(redis, 'campaign', campaignId, randomUUID(), 1);
    assert.equal(third.ok, true);
  });

  it('does not double-count when confirming a held reservation', async () => {
    const campaignId = randomUUID();
    const emailId = randomUUID();
    const hour = getUtcHourBucket();
    keysToDelete.push(campaignQuotaCounterKey(campaignId, hour));

    await reserveHourlyQuota(redis, 'campaign', campaignId, emailId, 5);
    await confirmHourlyQuotaReservation(redis, 'campaign', campaignId, emailId);
    const retryHold = await reserveHourlyQuota(redis, 'campaign', campaignId, emailId, 5);
    assert.equal(retryHold.ok, true);
    assert.equal(retryHold.alreadyHeld, true);
  });

  it('allows only one concurrent reservation for the last available slot', async () => {
    const campaignId = randomUUID();
    const hour = getUtcHourBucket();
    keysToDelete.push(campaignQuotaCounterKey(campaignId, hour));

    const limit = 3;
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        reserveHourlyQuota(redis, 'campaign', campaignId, randomUUID(), limit),
      ),
    );

    const successes = results.filter((result) => result.ok).length;
    assert.equal(successes, limit);
  });
});
