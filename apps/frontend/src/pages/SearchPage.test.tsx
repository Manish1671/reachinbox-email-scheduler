import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldShowSearchUnavailable } from '../utils/search-state';

describe('SearchPage states', () => {
  it('shows unavailable messaging when Elasticsearch is down', () => {
    assert.equal(shouldShowSearchUnavailable(false, false), true);
    assert.equal(shouldShowSearchUnavailable(false, true), false);
  });
});
