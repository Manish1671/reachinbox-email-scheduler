export const QUEUE_NAMES = {
  EMAIL: 'email-queue',
} as const;

export const EMAIL_JOB_NAMES = {
  SEND_EMAIL: 'send-email',
} as const;

export const EMAIL_JOB_ATTEMPTS = 3;

export const EMAIL_JOB_BACKOFF_MS = 2_000;

export const BCRYPT_SALT_ROUNDS = 12;

export const PASSWORD_MIN_LENGTH = 8;

export const API_PREFIX = '/api';

export const SUBJECT_MAX_LENGTH = 200;

export const BODY_MAX_LENGTH = 10_000;

export const DEFAULT_EMAIL_LIST_LIMIT = 50;

export const MAX_EMAIL_LIST_LIMIT = 100;

export const FAILURE_REASON_MAX_LENGTH = 500;

export const EMAIL_RECONCILE_BATCH_SIZE = 100;
