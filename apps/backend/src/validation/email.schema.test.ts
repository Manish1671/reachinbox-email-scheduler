import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmailBodySchema } from './email.schema';

describe('createEmailBodySchema', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  it('trims and lowercases the recipient', () => {
    const parsed = createEmailBodySchema.parse({
      recipient: '  Test@Example.COM ',
      subject: 'Hello',
      body: 'Body',
      scheduledAt: future,
    });

    assert.equal(parsed.recipient, 'test@example.com');
    assert.equal(parsed.scheduledAt.toISOString(), future);
  });

  it('normalizes an offset timestamp to a UTC instant', () => {
    const parsed = createEmailBodySchema.parse({
      recipient: 'test@example.com',
      subject: 'Hello',
      body: 'Body',
      scheduledAt: '2026-09-06T18:30:00+05:30',
    });

    assert.equal(parsed.scheduledAt.toISOString(), '2026-09-06T13:00:00.000Z');
  });

  it('rejects an invalid recipient', () => {
    const result = createEmailBodySchema.safeParse({
      recipient: 'not-an-email',
      subject: 'Hello',
      body: 'Body',
      scheduledAt: future,
    });
    assert.equal(result.success, false);
  });

  it('rejects a missing subject', () => {
    const result = createEmailBodySchema.safeParse({
      recipient: 'test@example.com',
      body: 'Body',
      scheduledAt: future,
    });
    assert.equal(result.success, false);
  });

  it('rejects a missing body', () => {
    const result = createEmailBodySchema.safeParse({
      recipient: 'test@example.com',
      subject: 'Hello',
      scheduledAt: future,
    });
    assert.equal(result.success, false);
  });

  it('rejects a timezone-less datetime', () => {
    const result = createEmailBodySchema.safeParse({
      recipient: 'test@example.com',
      subject: 'Hello',
      body: 'Body',
      scheduledAt: '2026-09-06T18:30:00',
    });
    assert.equal(result.success, false);
  });

  it('rejects an invalid scheduledAt', () => {
    const result = createEmailBodySchema.safeParse({
      recipient: 'test@example.com',
      subject: 'Hello',
      body: 'Body',
      scheduledAt: 'not-a-date',
    });
    assert.equal(result.success, false);
  });
});
