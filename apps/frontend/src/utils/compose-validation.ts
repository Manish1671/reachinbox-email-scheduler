import { isLocalDateTimeInPast } from './datetime';

const RECIPIENT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ComposeFieldErrors = {
  recipient?: string;
  recipients?: string;
  subject?: string;
  body?: string;
  date?: string;
  time?: string;
  minDelaySeconds?: string;
  hourlyQuota?: string;
};

export function validateSharedComposeFields(input: {
  subject: string;
  body: string;
  date: string;
  time: string;
}): ComposeFieldErrors {
  const next: ComposeFieldErrors = {};
  if (!input.subject.trim()) {
    next.subject = 'Subject is required.';
  }
  if (!input.body.trim()) {
    next.body = 'Body is required.';
  }
  if (!input.date) {
    next.date = 'Date is required.';
  }
  if (!input.time) {
    next.time = 'Time is required.';
  }
  if (input.date && input.time && isLocalDateTimeInPast(input.date, input.time)) {
    next.time = 'Please choose a future time.';
  }
  return next;
}

export function validateSingleEmailCompose(input: {
  recipient: string;
  subject: string;
  body: string;
  date: string;
  time: string;
}): ComposeFieldErrors {
  const next = validateSharedComposeFields(input);
  if (!input.recipient.trim()) {
    next.recipient = 'Recipient is required.';
  } else if (!RECIPIENT_PATTERN.test(input.recipient.trim())) {
    next.recipient = 'Enter a valid email address.';
  }
  return next;
}

export function validateCampaignCompose(input: {
  recipients: string;
  subject: string;
  body: string;
  date: string;
  time: string;
  minDelaySeconds: string;
  hourlyQuota: string;
}): ComposeFieldErrors {
  const next = validateSharedComposeFields(input);
  if (!input.recipients.trim()) {
    next.recipients = 'Add at least one recipient line or upload a file.';
  }
  const delay = Number(input.minDelaySeconds);
  if (!Number.isFinite(delay) || delay < 0) {
    next.minDelaySeconds = 'Enter a non-negative delay in seconds.';
  }
  const quota = Number(input.hourlyQuota);
  if (!Number.isInteger(quota) || quota < 1) {
    next.hourlyQuota = 'Hourly quota must be at least 1.';
  }
  return next;
}

export function countRecipientLines(recipients: string): number {
  return recipients.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}
