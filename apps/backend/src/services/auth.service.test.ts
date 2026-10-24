import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { prisma } from '../db/prisma';
import { AppError } from '../utils/app-error';
import { authService } from './auth.service';

const createdUserIds: string[] = [];

function uniqueEmail(label: string): string {
  return `auth-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

after(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

describe('authService', () => {
  it('registers a user, hashes the password, and returns a token without passwordHash', async () => {
    const email = uniqueEmail('register');
    const result = await authService.register({ email, password: 'password123' });
    createdUserIds.push(result.user.id);

    assert.equal(result.user.email, email);
    assert.equal(typeof result.token, 'string');
    assert.equal('passwordHash' in result.user, false);
    assert.equal('password' in result.user, false);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: result.user.id } });
    assert.notEqual(stored.passwordHash, 'password123');
    assert.equal(stored.passwordHash.startsWith('$2'), true);
  });

  it('rejects a duplicate email', async () => {
    const email = uniqueEmail('duplicate');
    const first = await authService.register({ email, password: 'password123' });
    createdUserIds.push(first.user.id);

    await assert.rejects(
      () => authService.register({ email, password: 'password123' }),
      (error: unknown) =>
        error instanceof AppError && error.code === 'EMAIL_IN_USE' && error.statusCode === 409,
    );
  });

  it('logs in with valid credentials and rejects wrong passwords with a generic error', async () => {
    const email = uniqueEmail('login');
    const created = await authService.register({ email, password: 'password123' });
    createdUserIds.push(created.user.id);

    const loggedIn = await authService.login({ email, password: 'password123' });
    assert.equal(loggedIn.user.id, created.user.id);
    assert.equal('passwordHash' in loggedIn.user, false);

    await assert.rejects(
      () => authService.login({ email, password: 'wrong-password' }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === 'INVALID_CREDENTIALS' &&
        error.message === 'Invalid email or password',
    );

    await assert.rejects(
      () => authService.login({ email: uniqueEmail('missing'), password: 'password123' }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === 'INVALID_CREDENTIALS' &&
        error.message === 'Invalid email or password',
    );
  });
});
