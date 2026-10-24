import { Queue, type Job } from 'bullmq';
import {
  EMAIL_JOB_ATTEMPTS,
  EMAIL_JOB_BACKOFF_MS,
  EMAIL_JOB_NAMES,
  QUEUE_NAMES,
} from '../config/constants';
import { getBullMqConnection } from './connection';

export type SendEmailJobData = {
  emailId: string;
};

export type EmailQueueOptions = {
  prefix?: string;
};

export type EmailJobState =
  | 'waiting'
  | 'delayed'
  | 'paused'
  | 'waiting-children'
  | 'prioritized'
  | 'active'
  | 'completed'
  | 'failed'
  | 'unknown'
  | 'missing';

export type LiveJobState = Extract<
  EmailJobState,
  'waiting' | 'delayed' | 'paused' | 'waiting-children' | 'prioritized' | 'active'
>;

const LIVE_JOB_STATES = new Set<EmailJobState>([
  'waiting',
  'delayed',
  'paused',
  'waiting-children',
  'prioritized',
  'active',
]);

const globalForQueue = globalThis as unknown as { emailQueue?: Queue<SendEmailJobData> };

function defaultJobOptions() {
  return {
    attempts: EMAIL_JOB_ATTEMPTS,
    backoff: {
      type: 'exponential' as const,
      delay: EMAIL_JOB_BACKOFF_MS,
    },
    removeOnComplete: false,
    removeOnFail: false,
  };
}

export function createEmailQueue(options: EmailQueueOptions = {}): Queue<SendEmailJobData> {
  return new Queue<SendEmailJobData>(QUEUE_NAMES.EMAIL, {
    connection: getBullMqConnection(),
    prefix: options.prefix,
    defaultJobOptions: defaultJobOptions(),
  });
}

export function getEmailQueue(): Queue<SendEmailJobData> {
  if (!globalForQueue.emailQueue) {
    globalForQueue.emailQueue = createEmailQueue();
  }

  return globalForQueue.emailQueue;
}

export function calculateJobDelayMs(scheduledAt: Date, now = new Date()): number {
  return Math.max(0, scheduledAt.getTime() - now.getTime());
}

export async function addSendEmailJob(
  emailId: string,
  scheduledAt: Date,
  queue: Queue<SendEmailJobData> = getEmailQueue(),
  now = new Date(),
): Promise<Job<SendEmailJobData>> {
  const delay = calculateJobDelayMs(scheduledAt, now);

  return queue.add(
    EMAIL_JOB_NAMES.SEND_EMAIL,
    { emailId },
    {
      jobId: emailId,
      delay,
    },
  );
}

export async function getEmailJob(
  emailId: string,
  queue: Queue<SendEmailJobData> = getEmailQueue(),
): Promise<Job<SendEmailJobData> | undefined> {
  const job = await queue.getJob(emailId);
  return job ?? undefined;
}

export async function getEmailJobState(
  emailId: string,
  queue: Queue<SendEmailJobData> = getEmailQueue(),
): Promise<EmailJobState> {
  const job = await getEmailJob(emailId, queue);
  if (!job) {
    return 'missing';
  }
  return (await job.getState()) as EmailJobState;
}

export function isLiveJobState(state: EmailJobState): state is LiveJobState {
  return LIVE_JOB_STATES.has(state);
}

function isDuplicateJobIdError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already (exists|exist)/i.test(message);
}

export async function ensureSendEmailJob(
  emailId: string,
  scheduledAt: Date,
  queue: Queue<SendEmailJobData> = getEmailQueue(),
  now = new Date(),
): Promise<{ job: Job<SendEmailJobData>; created: boolean; state: EmailJobState }> {
  const existing = await getEmailJob(emailId, queue);
  if (existing) {
    const state = (await existing.getState()) as EmailJobState;
    if (isLiveJobState(state)) {
      return { job: existing, created: false, state };
    }

    await existing.remove();
  }

  try {
    const job = await addSendEmailJob(emailId, scheduledAt, queue, now);
    return { job, created: true, state: 'missing' };
  } catch (error) {
    if (!isDuplicateJobIdError(error)) {
      throw error;
    }

    const job = await getEmailJob(emailId, queue);
    if (!job) {
      throw error;
    }
    return { job, created: false, state: (await job.getState()) as EmailJobState };
  }
}

export async function removeIdleEmailJob(
  emailId: string,
  queue: Queue<SendEmailJobData> = getEmailQueue(),
): Promise<boolean> {
  const job = await getEmailJob(emailId, queue);
  if (!job) {
    return false;
  }

  const state = await job.getState();
  if (state === 'active') {
    return false;
  }

  await job.remove();
  return true;
}

export async function closeEmailQueue(): Promise<void> {
  if (!globalForQueue.emailQueue) {
    return;
  }

  await globalForQueue.emailQueue.close();
  globalForQueue.emailQueue = undefined;
}
