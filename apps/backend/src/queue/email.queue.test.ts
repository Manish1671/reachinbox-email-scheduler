import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateJobDelayMs } from './email.queue';

describe('calculateJobDelayMs', () => {
  it('returns the millisecond difference for a future time', () => {
    const now = new Date('2026-09-06T12:00:00.000Z');
    const scheduledAt = new Date('2026-09-06T12:05:00.000Z');
    assert.equal(calculateJobDelayMs(scheduledAt, now), 5 * 60 * 1000);
  });

  it('never returns a negative delay', () => {
    const now = new Date('2026-09-06T12:00:00.000Z');
    const scheduledAt = new Date('2026-09-06T11:00:00.000Z');
    assert.equal(calculateJobDelayMs(scheduledAt, now), 0);
  });
});
