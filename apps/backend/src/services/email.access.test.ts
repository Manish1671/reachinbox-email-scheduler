import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { prisma } from '../db/prisma';
import { AppError } from '../utils/app-error';
import { hashPassword } from '../utils/password';
import { getEmailByIdForUser } from './email.access';

const createdUserIds: string[] = [];

after(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

describe('getEmailByIdForUser', () => {
  it('returns an email only when it belongs to the authenticated user', async () => {
    const passwordHash = await hashPassword('password123');
    const [owner, other] = await Promise.all([
      prisma.user.create({
        data: { email: `owner-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`, passwordHash },
      }),
      prisma.user.create({
        data: { email: `other-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`, passwordHash },
      }),
    ]);
    createdUserIds.push(owner.id, other.id);

    const email = await prisma.email.create({
      data: {
        userId: owner.id,
        recipient: 'recipient@example.com',
        subject: 'Ownership check',
        body: 'Body',
        scheduledAt: new Date(),
      },
    });

    const found = await getEmailByIdForUser(email.id, owner.id);
    assert.equal(found.id, email.id);
    assert.equal(found.userId, owner.id);

    await assert.rejects(
      () => getEmailByIdForUser(email.id, other.id),
      (error: unknown) => error instanceof AppError && error.statusCode === 404,
    );
  });
});
