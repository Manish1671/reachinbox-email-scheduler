import { CAMPAIGN_MAX_RECIPIENTS, CAMPAIGN_RECIPIENTS_MAX_BYTES } from '../config/constants';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HEADER_TOKENS = new Set(['email', 'recipient', 'recipients', 'e-mail']);

export type InvalidRecipientLine = {
  line: number;
  content: string;
  reason: string;
};

export type ParseRecipientsResult = {
  recipients: string[];
  invalidLines: InvalidRecipientLine[];
};

export class RecipientParseError extends Error {
  constructor(
    message: string,
    readonly code: 'RECIPIENTS_EMPTY' | 'RECIPIENTS_TOO_LARGE' | 'RECIPIENTS_TOO_MANY',
  ) {
    super(message);
    this.name = 'RecipientParseError';
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  const normalized = normalizeEmail(value);
  return normalized.length > 0 && EMAIL_PATTERN.test(normalized);
}

/** Split a single CSV line on commas outside double quotes. */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  fields.push(current);
  return fields.map((field) => field.trim());
}

function extractEmailsFromLine(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) {
    return [];
  }

  const fields = trimmed.includes(',') ? splitCsvLine(trimmed) : [trimmed];
  const emails: string[] = [];

  for (const field of fields) {
    const candidate = field.replace(/^"|"$/g, '').trim();
    if (!candidate) {
      continue;
    }
    const normalized = normalizeEmail(candidate);
    if (HEADER_TOKENS.has(normalized)) {
      continue;
    }
    emails.push(normalized);
  }

  return emails;
}

export function parseRecipientsInput(content: string): ParseRecipientsResult {
  if (content.length > CAMPAIGN_RECIPIENTS_MAX_BYTES) {
    throw new RecipientParseError(
      `Recipient list must be at most ${CAMPAIGN_RECIPIENTS_MAX_BYTES} bytes`,
      'RECIPIENTS_TOO_LARGE',
    );
  }

  const lines = content.split(/\r?\n/);
  const seen = new Set<string>();
  const recipients: string[] = [];
  const invalidLines: InvalidRecipientLine[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? '';
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const candidates = extractEmailsFromLine(rawLine);
    if (candidates.length === 0) {
      invalidLines.push({
        line: lineNumber,
        content: trimmed,
        reason: 'No email address found on this line',
      });
      continue;
    }

    for (const candidate of candidates) {
      if (!isValidEmail(candidate)) {
        invalidLines.push({
          line: lineNumber,
          content: trimmed,
          reason: `Invalid email address: ${candidate}`,
        });
        continue;
      }

      if (seen.has(candidate)) {
        continue;
      }

      seen.add(candidate);
      recipients.push(candidate);
    }
  }

  if (recipients.length === 0) {
    throw new RecipientParseError('At least one valid recipient is required', 'RECIPIENTS_EMPTY');
  }

  if (recipients.length > CAMPAIGN_MAX_RECIPIENTS) {
    throw new RecipientParseError(
      `Recipient list must contain at most ${CAMPAIGN_MAX_RECIPIENTS} unique addresses`,
      'RECIPIENTS_TOO_MANY',
    );
  }

  return { recipients, invalidLines };
}
