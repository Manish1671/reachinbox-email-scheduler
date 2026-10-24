import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loginBodySchema, registerBodySchema } from './auth.schema';

describe('registerBodySchema', () => {
  it('trims and lowercases email', () => {
    const parsed = registerBodySchema.parse({
      email: '  User@Example.COM ',
      password: 'password123',
    });

    assert.equal(parsed.email, 'user@example.com');
  });

  it('rejects malformed emails', () => {
    const result = registerBodySchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    });

    assert.equal(result.success, false);
  });

  it('rejects short passwords', () => {
    const result = registerBodySchema.safeParse({
      email: 'user@example.com',
      password: 'short',
    });

    assert.equal(result.success, false);
  });
});

describe('loginBodySchema', () => {
  it('normalizes email and accepts any non-empty password', () => {
    const parsed = loginBodySchema.parse({
      email: '  Admin@Example.com ',
      password: 'x',
    });

    assert.equal(parsed.email, 'admin@example.com');
    assert.equal(parsed.password, 'x');
  });
});
