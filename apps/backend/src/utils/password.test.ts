import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPassword, verifyPassword } from './password';

describe('password helpers', () => {
  it('hashes a password without storing the plaintext', async () => {
    const hash = await hashPassword('password123');

    assert.notEqual(hash, 'password123');
    assert.equal(await verifyPassword('password123', hash), true);
    assert.equal(await verifyPassword('wrong-password', hash), false);
  });

  it('returns false when the stored hash is missing', async () => {
    assert.equal(await verifyPassword('password123', null), false);
  });
});
