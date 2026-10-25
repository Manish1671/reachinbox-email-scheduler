import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DeferSendError } from '../utils/defer-send-error';
import { handleDeferredSend } from './send-orchestration.service';

describe('handleDeferredSend', () => {
  it('requires a BullMQ lock token before moveToDelayed', async () => {
    const job = {
      token: undefined,
      moveToDelayed: async () => undefined,
    };

    await assert.rejects(
      () =>
        handleDeferredSend(job as never, 'email-id', new DeferSendError({
          delayMs: 1000,
          reason: 'MIN_DELAY',
          message: 'defer',
        })),
      /lock token/i,
    );
  });

});
