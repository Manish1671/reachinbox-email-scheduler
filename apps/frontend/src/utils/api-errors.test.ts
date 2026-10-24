import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getApiErrorMessage, mapApiError } from './api-errors';

describe('api error mapping', () => {
  it('maps known backend codes to user-facing copy', () => {
    assert.equal(mapApiError(400, 'INVALID_SCHEDULE_TIME'), 'Please choose a future time.');
    assert.equal(
      mapApiError(503, 'QUEUE_ENQUEUE_FAILED'),
      'Your email was saved but could not be queued yet. Please try again later.',
    );
    assert.equal(mapApiError(409, 'EMAIL_IN_USE'), 'This email is already registered.');
    assert.equal(mapApiError(401, 'INVALID_CREDENTIALS'), 'Invalid email or password.');
    assert.equal(mapApiError(401), 'Your session has expired. Please log in again.');
  });

  it('does not expose raw network internals for unknown errors', () => {
    assert.equal(getApiErrorMessage({}), 'Something went wrong. Please try again.');
  });
});
