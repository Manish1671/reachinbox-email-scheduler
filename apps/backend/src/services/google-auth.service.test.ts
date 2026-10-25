import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { prisma } from '../db/prisma';
import { redis } from '../queue/redis';
import { AppError } from '../utils/app-error';
import { exchangeGoogleCode } from './google-auth.service';

describe('google-auth.service', () => {
  it('rejects invalid exchange codes', async () => {
    await assert.rejects(
      () => exchangeGoogleCode('missing-exchange-code'),
      (error: unknown) =>
        error instanceof AppError && error.code === 'GOOGLE_EXCHANGE_INVALID' && error.statusCode === 400,
    );
  });

  it('returns a safe public user without provider tokens', async () => {
    const user = await prisma.user.create({
      data: {
        email: `google-exchange-${Date.now()}@example.com`,
        passwordHash: null,
        googleSubject: `sub-${Date.now()}`,
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
      },
      select: { id: true },
    });

    const exchangeCode = `exchange-${Date.now()}`;
    await redis.set(
      `google:exchange:${exchangeCode}`,
      JSON.stringify({ userId: user.id }),
      'EX',
      60,
    );

    const result = await exchangeGoogleCode(exchangeCode);
    assert.equal(result.user.id, user.id);
    assert.equal(result.user.name, 'Test User');
    assert.equal(result.user.avatarUrl, 'https://example.com/avatar.png');
    assert.equal('googleSubject' in result.user, false);
    assert.equal(typeof result.token, 'string');

    await prisma.user.delete({ where: { id: user.id } });
  });

});
