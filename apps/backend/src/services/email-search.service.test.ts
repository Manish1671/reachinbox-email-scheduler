import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { searchEmailsForUser } from './email-search.service';

describe('email-search.service', () => {
  it('returns unavailable results when Elasticsearch is disabled', async () => {
    const result = await searchEmailsForUser({
      userId: 'user-1',
      page: 1,
      pageSize: 10,
      sort: 'updatedAt',
    });
    assert.equal(result.available, false);
    assert.equal(result.hits.length, 0);
    assert.equal(result.total, 0);
  });
});
