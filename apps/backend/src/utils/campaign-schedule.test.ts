import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateStaggeredScheduledAt } from './campaign-schedule';

describe('calculateStaggeredScheduledAt', () => {
  it('uses the start time for the first recipient', () => {
    const startAt = new Date('2030-06-01T10:00:00.000Z');
    const scheduled = calculateStaggeredScheduledAt(startAt, 0, 5_000);
    assert.equal(scheduled.toISOString(), startAt.toISOString());
  });

  it('staggers later recipients by minDelayMs', () => {
    const startAt = new Date('2030-06-01T10:00:00.000Z');
    const scheduled = calculateStaggeredScheduledAt(startAt, 3, 5_000);
    assert.equal(scheduled.toISOString(), '2030-06-01T10:00:15.000Z');
  });

  it('preserves timezone-aware instants from ISO input', () => {
    const startAt = new Date('2030-06-01T10:00:00+05:30');
    const scheduled = calculateStaggeredScheduledAt(startAt, 2, 1_000);
    assert.equal(scheduled.getTime(), startAt.getTime() + 2_000);
  });
});
