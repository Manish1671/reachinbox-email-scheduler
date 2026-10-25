import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emailSearchQuerySchema } from './email-search.schema';

describe('emailSearchQuerySchema', () => {
  it('applies defaults for pagination and sort', () => {
    const parsed = emailSearchQuerySchema.parse({});
    assert.equal(parsed.page, 1);
    assert.equal(parsed.pageSize, 20);
    assert.equal(parsed.sort, 'updatedAt');
  });

  it('rejects oversized pageSize', () => {
    assert.throws(() => emailSearchQuerySchema.parse({ pageSize: 100 }));
  });
});
