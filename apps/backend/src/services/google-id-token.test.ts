import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { env } from '../config/env';
import { validateGoogleIdTokenClaims } from './google-id-token';

describe('validateGoogleIdTokenClaims', () => {
  const baseClaims = {
    iss: 'https://accounts.google.com',
    aud: env.GOOGLE_CLIENT_ID,
    sub: 'google-subject-1',
    email: 'user@example.com',
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 300,
  };

  it('rejects expired tokens', () => {
    assert.throws(() =>
      validateGoogleIdTokenClaims({
        ...baseClaims,
        exp: Math.floor(Date.now() / 1000) - 10,
      }),
    );
  });

  it('accepts verified tokens with required claims', () => {
    const profile = validateGoogleIdTokenClaims(baseClaims);
    assert.equal(profile.sub, 'google-subject-1');
    assert.equal(profile.email, 'user@example.com');
  });
});
