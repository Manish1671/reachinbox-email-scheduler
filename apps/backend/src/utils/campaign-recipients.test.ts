import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CAMPAIGN_RECIPIENTS_MAX_BYTES } from '../config/constants';
import {
  parseRecipientsInput,
  RecipientParseError,
  splitCsvLine,
} from './campaign-recipients';

describe('splitCsvLine', () => {
  it('splits simple comma-separated values', () => {
    assert.deepEqual(splitCsvLine('a@example.com,b@example.com'), ['a@example.com', 'b@example.com']);
  });

  it('respects quoted commas', () => {
    assert.deepEqual(splitCsvLine('"a@example.com","b@example.com"'), [
      'a@example.com',
      'b@example.com',
    ]);
  });
});

describe('parseRecipientsInput', () => {
  it('parses plain-text one email per line', () => {
    const result = parseRecipientsInput('one@example.com\ntwo@example.com\n');
    assert.deepEqual(result.recipients, ['one@example.com', 'two@example.com']);
    assert.equal(result.invalidLines.length, 0);
  });

  it('parses CSV rows and skips a header row', () => {
    const result = parseRecipientsInput('email\na@example.com,b@example.com\nc@example.com');
    assert.deepEqual(result.recipients, ['a@example.com', 'b@example.com', 'c@example.com']);
  });

  it('deduplicates case-insensitive addresses', () => {
    const result = parseRecipientsInput('A@example.com\na@example.com\nB@example.com');
    assert.deepEqual(result.recipients, ['a@example.com', 'b@example.com']);
  });

  it('records invalid lines while keeping valid addresses', () => {
    const result = parseRecipientsInput('good@example.com\nnot-an-email\nalso@example.com');
    assert.deepEqual(result.recipients, ['good@example.com', 'also@example.com']);
    assert.equal(result.invalidLines.length, 1);
    assert.equal(result.invalidLines[0]?.line, 2);
  });

  it('rejects empty uploads', () => {
    assert.throws(() => parseRecipientsInput('   \n# comment only\n'), (error: unknown) => {
      return error instanceof RecipientParseError && error.code === 'RECIPIENTS_EMPTY';
    });
  });

  it('rejects payloads larger than the configured byte limit', () => {
    const oversized = 'a'.repeat(CAMPAIGN_RECIPIENTS_MAX_BYTES + 1);
    assert.throws(() => parseRecipientsInput(oversized), (error: unknown) => {
      return error instanceof RecipientParseError && error.code === 'RECIPIENTS_TOO_LARGE';
    });
  });
});
