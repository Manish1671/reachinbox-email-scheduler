export type DeferralReason = 'MIN_DELAY' | 'CAMPAIGN_QUOTA_EXHAUSTED' | 'SENDER_QUOTA_EXHAUSTED';

export class DeferSendError extends Error {
  readonly delayMs: number;
  readonly reason: DeferralReason;
  readonly senderAccountId?: string;
  readonly senderLabel?: string;

  constructor(options: {
    delayMs: number;
    reason: DeferralReason;
    message: string;
    senderAccountId?: string;
    senderLabel?: string;
  }) {
    super(options.message);
    this.name = 'DeferSendError';
    this.delayMs = options.delayMs;
    this.reason = options.reason;
    this.senderAccountId = options.senderAccountId;
    this.senderLabel = options.senderLabel;
  }
}
