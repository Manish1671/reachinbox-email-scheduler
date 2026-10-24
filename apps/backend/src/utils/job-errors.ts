export class RetryableJobError extends Error {
  readonly retryable = true as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RetryableJobError';
  }
}

export class PermanentJobError extends Error {
  readonly retryable = false as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PermanentJobError';
  }
}

export function isRetryableJobError(error: unknown): boolean {
  return error instanceof RetryableJobError;
}
