import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getNextUtcHourStartMs, getUtcHourBucket } from './quota-hour';

describe('quota hour buckets', () => {
  it('uses UTC hour boundaries for bucket keys', () => {
    const date = new Date('2030-06-01T10:45:00.000Z');
    assert.equal(getUtcHourBucket(date), '2030060110');
    const nextHour = getNextUtcHourStartMs(date);
    assert.equal(new Date(nextHour).toISOString(), '2030-06-01T11:00:00.000Z');
  });
});
