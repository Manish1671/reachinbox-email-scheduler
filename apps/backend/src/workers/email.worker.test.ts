import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { EMAIL_JOB_ATTEMPTS, EMAIL_JOB_BACKOFF_MS } from '../config/constants';
import { createEmailWorker } from './email.worker';

const workerDir = path.join(__dirname);

function readWorkerSource(fileName: string): string {
  return readFileSync(path.join(workerDir, fileName), 'utf8');
}

describe('email worker process', () => {
  it('does not import Express or the HTTP app', () => {
    for (const fileName of ['index.ts', 'runtime.ts', 'email.worker.ts', 'email.processor.ts']) {
      const source = readWorkerSource(fileName);
      assert.equal(source.includes("from '../app'"), false, fileName);
      assert.equal(source.includes("from '../server'"), false, fileName);
      assert.equal(source.includes("from 'express'"), false, fileName);
    }
  });

  it('closes the BullMQ worker without hanging', async () => {
    const worker = createEmailWorker({
      deliver: async () => ({ messageId: 'unused' }),
      autorun: false,
    });

    await worker.close();
    assert.equal(worker.isRunning(), false);
  });
});

describe('queue retry defaults', () => {
  it('uses three attempts with exponential backoff', async () => {
    const { getEmailQueue, closeEmailQueue } = await import('../queue/email.queue');
    const queue = getEmailQueue();
    try {
      assert.equal(queue.opts.defaultJobOptions?.attempts, EMAIL_JOB_ATTEMPTS);
      assert.deepEqual(queue.opts.defaultJobOptions?.backoff, {
        type: 'exponential',
        delay: EMAIL_JOB_BACKOFF_MS,
      });
    } finally {
      await closeEmailQueue();
    }
  });
});
