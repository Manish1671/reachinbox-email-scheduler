import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './app-error';
import { getUserIdFromToken, signAccessToken, verifyAccessToken } from './jwt';

describe('jwt helpers', () => {
  it('signs a token that contains only sub', () => {
    const token = signAccessToken('user-123');
    const decoded = jwt.verify(token, env.JWT_SECRET);

    assert.equal(typeof decoded, 'object');
    assert.ok(decoded);
    assert.equal((decoded as jwt.JwtPayload).sub, 'user-123');
    assert.equal((decoded as jwt.JwtPayload).email, undefined);
    assert.equal((decoded as jwt.JwtPayload).passwordHash, undefined);
  });

  it('verifies a valid token and extracts the user id', () => {
    const token = signAccessToken('user-456');
    assert.deepEqual(verifyAccessToken(token), { sub: 'user-456' });
    assert.equal(getUserIdFromToken(token), 'user-456');
  });

  it('rejects a malformed token', () => {
    assert.throws(() => verifyAccessToken('not-a-jwt'), (error: unknown) => {
      return error instanceof AppError && error.statusCode === 401 && error.code === 'UNAUTHORIZED';
    });
  });

  it('rejects a token signed with the wrong secret', () => {
    const token = jwt.sign({ sub: 'user-789' }, 'a-different-secret-value');
    assert.throws(() => verifyAccessToken(token), (error: unknown) => {
      return error instanceof AppError && error.statusCode === 401;
    });
  });

  it('rejects an expired token', () => {
    const token = jwt.sign(
      { sub: 'user-expired', exp: Math.floor(Date.now() / 1000) - 30 },
      env.JWT_SECRET,
    );
    assert.throws(() => verifyAccessToken(token), (error: unknown) => {
      return error instanceof AppError && error.statusCode === 401 && error.code === 'TOKEN_EXPIRED';
    });
  });
});
