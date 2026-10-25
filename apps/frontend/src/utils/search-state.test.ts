import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSearchQueryParams, shouldShowSearchUnavailable } from './search-state';

describe('search state helpers', () => {
  it('builds query params from filters', () => {
    const params = buildSearchQueryParams(
      { q: 'invoice', status: 'SENT', fromDate: '2026-01-01', toDate: '2026-01-31' },
      2,
      20,
    );
    assert.equal(params.q, 'invoice');
    assert.equal(params.status, 'SENT');
    assert.equal(params.page, 2);
    assert.equal(typeof params.from, 'string');
    assert.equal(typeof params.to, 'string');
  });

  it('shows unavailable banner only when search is down and idle', () => {
    assert.equal(shouldShowSearchUnavailable(false, false), true);
    assert.equal(shouldShowSearchUnavailable(false, true), false);
    assert.equal(shouldShowSearchUnavailable(true, false), false);
  });
});
