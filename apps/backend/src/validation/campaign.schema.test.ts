import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCampaignBodySchema } from './campaign.schema';

describe('createCampaignBodySchema', () => {
  it('accepts a valid campaign payload', () => {
    const parsed = createCampaignBodySchema.parse({
      subject: 'Hello',
      body: 'Campaign body',
      startAt: '2030-06-01T10:00:00.000Z',
      minDelayMs: 1000,
      hourlyQuota: 200,
      recipients: 'a@example.com\nb@example.com',
      idempotencyKey: 'batch-1',
    });

    assert.equal(parsed.subject, 'Hello');
    assert.equal(parsed.hourlyQuota, 200);
    assert.ok(parsed.startAt instanceof Date);
  });

  it('rejects timezone-less startAt values', () => {
    const result = createCampaignBodySchema.safeParse({
      subject: 'Hello',
      body: 'Body',
      startAt: '2030-06-01T10:00:00',
      minDelayMs: 0,
      hourlyQuota: 1,
      recipients: 'a@example.com',
    });
    assert.equal(result.success, false);
  });
});
