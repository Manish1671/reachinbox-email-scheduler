import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashSlackState } from './slack-oauth.service';

describe('slack oauth helpers', () => {
  it('hashes oauth state deterministically', () => {
    assert.equal(hashSlackState('state-token').length, 64);
    assert.equal(hashSlackState('state-token'), hashSlackState('state-token'));
  });
});
