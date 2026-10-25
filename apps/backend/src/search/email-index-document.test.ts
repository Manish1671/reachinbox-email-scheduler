import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EmailStatus } from '@prisma/client';
import { BODY_SNIPPET_MAX_LENGTH, buildEmailSearchDocument } from './email-index-document';

describe('buildEmailSearchDocument', () => {
  it('truncates body snippets and omits full body content', () => {
    const longBody = 'x'.repeat(BODY_SNIPPET_MAX_LENGTH + 50);
    const document = buildEmailSearchDocument({
      id: 'email-1',
      userId: 'user-1',
      campaignId: null,
      recipient: 'a@example.com',
      subject: 'Hello',
      body: longBody,
      status: EmailStatus.QUEUED,
      scheduledAt: new Date('2026-01-01T00:00:00.000Z'),
      sentAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      failureReason: null,
      providerMessageId: null,
      sequenceIndex: null,
      smtpSenderAccountId: null,
      deferralReason: null,
    } as Parameters<typeof buildEmailSearchDocument>[0]);

    assert.equal(document.bodySnippet.length, BODY_SNIPPET_MAX_LENGTH);
    assert.equal(document.emailId, 'email-1');
    assert.equal(document.userId, 'user-1');
  });
});
