import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countRecipientLines,
  validateCampaignCompose,
  validateSingleEmailCompose,
} from './compose-validation';
import { defaultScheduleParts } from './datetime';

describe('compose validation', () => {
  const schedule = defaultScheduleParts();

  it('requires a valid single recipient', () => {
    const errors = validateSingleEmailCompose({
      recipient: 'not-an-email',
      subject: 'Hello',
      body: 'Body',
      date: schedule.date,
      time: schedule.time,
    });
    assert.equal(errors.recipient, 'Enter a valid email address.');
  });

  it('requires campaign recipients and positive hourly quota', () => {
    const errors = validateCampaignCompose({
      recipients: '',
      subject: 'Campaign',
      body: 'Body',
      date: schedule.date,
      time: schedule.time,
      minDelaySeconds: '5',
      hourlyQuota: '0',
    });
    assert.equal(errors.recipients, 'Add at least one recipient line or upload a file.');
    assert.equal(errors.hourlyQuota, 'Hourly quota must be at least 1.');
  });

  it('counts non-empty recipient lines', () => {
    assert.equal(countRecipientLines('a@example.com\n\nb@example.com'), 2);
  });
});
