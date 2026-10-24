import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultScheduleParts, isLocalDateTimeInPast, toIsoFromLocalDateTime } from './datetime';

describe('datetime helpers', () => {
  it('converts local date and time to an ISO instant without appending Z to the local clock', () => {
    const iso = toIsoFromLocalDateTime('2026-09-07', '19:30');
    const parsed = new Date(iso);
    assert.equal(parsed.getFullYear(), 2026);
    assert.equal(parsed.getMonth(), 8);
    assert.equal(parsed.getDate(), 7);
    assert.equal(parsed.getHours(), 19);
    assert.equal(parsed.getMinutes(), 30);
    assert.match(iso, /Z$/);
  });

  it('treats a local datetime in the past as invalid for scheduling', () => {
    assert.equal(isLocalDateTimeInPast('2020-01-01', '00:00', new Date('2026-09-07T12:00:00')), true);
    const future = defaultScheduleParts(new Date('2026-09-07T12:00:00'), 10);
    assert.equal(isLocalDateTimeInPast(future.date, future.time, new Date('2026-09-07T12:00:00')), false);
  });
});
