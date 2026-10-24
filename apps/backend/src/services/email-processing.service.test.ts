import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { EmailStatus } from '@prisma/client';
import { prisma } from '../db/prisma';
import { createTestUser, deleteUsers, futureIso } from '../test/helpers';
import { claimQueuedEmail } from './email-processing.service';

const createdUserIds: string[] = [];

after(async () => {
  await deleteUsers(createdUserIds);
});

describe('claimQueuedEmail', () => {
  it('atomically allows only one claim of a QUEUED email', async () => {
    const owner = await createTestUser('claim-owner');
    createdUserIds.push(owner.user.id);

    const email = await prisma.email.create({
      data: {
        userId: owner.user.id,
        recipient: 'recipient@example.com',
        subject: 'Claim race',
        body: 'Body',
        scheduledAt: new Date(futureIso()),
        status: EmailStatus.QUEUED,
      },
    });

    const [first, second] = await Promise.all([
      claimQueuedEmail(email.id),
      claimQueuedEmail(email.id),
    ]);

    const kinds = [first.kind, second.kind].sort();
    assert.deepEqual(kinds, ['already-processing', 'claimed']);

    const stored = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    assert.equal(stored.status, EmailStatus.PROCESSING);
  });
});
