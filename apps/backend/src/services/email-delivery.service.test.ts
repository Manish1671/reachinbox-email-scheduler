import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PermanentJobError, RetryableJobError } from '../utils/job-errors';
import {
  classifyDeliveryError,
  hasEtherealCredentials,
  sendEmail,
  type MailTransport,
} from './email-delivery.service';

function fakeTransport(result: unknown, error?: unknown): MailTransport {
  return {
    async sendMail(mail) {
      if (error) {
        throw error;
      }
      assert.equal(mail.to, 'to@example.com');
      assert.equal(mail.subject, 'Subject line');
      assert.equal(mail.text, 'Body text');
      assert.match(mail.from, /@/);
      return result as never;
    },
  };
}

describe('email-delivery.service', () => {
  it('sends through the injected transport and returns the provider message id', async () => {
    const result = await sendEmail(
      { recipient: 'to@example.com', subject: 'Subject line', body: 'Body text' },
      fakeTransport({ messageId: '<smtp-id@ethereal.email>' }),
    );

    assert.equal(result.messageId, '<smtp-id@ethereal.email>');
  });

  it('fails clearly when Ethereal credentials are missing and no test transport is injected', async () => {
    if (hasEtherealCredentials()) {
      return;
    }

    await assert.rejects(
      () => sendEmail({ recipient: 'to@example.com', subject: 'S', body: 'B' }),
      (error: unknown) =>
        error instanceof PermanentJobError && /Ethereal credentials are not configured/.test(error.message),
    );
  });

  it('classifies 4xx SMTP responses as retryable and 5xx as permanent', () => {
    const retryable = classifyDeliveryError({ message: 'try later', responseCode: 421 });
    const permanent = classifyDeliveryError({ message: 'no such user', responseCode: 550 });
    assert.ok(retryable instanceof RetryableJobError);
    assert.ok(permanent instanceof PermanentJobError);
  });

  it('classifies connection resets as retryable', () => {
    const error = classifyDeliveryError({ message: 'reset', code: 'ECONNRESET' });
    assert.ok(error instanceof RetryableJobError);
  });
});
