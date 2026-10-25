import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decryptSecret, encryptSecret } from './secret-cipher';

describe('secret cipher', () => {
  it('round-trips encrypted secrets', () => {
    const plaintext = 'smtp-password-value';
    const encrypted = encryptSecret(plaintext);
    assert.notEqual(encrypted, plaintext);
    assert.equal(decryptSecret(encrypted), plaintext);
  });
});
