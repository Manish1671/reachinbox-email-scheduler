export type CampaignStatus = 'SCHEDULED' | 'QUEUED' | 'COMPLETED' | 'FAILED' | 'PARTIAL';

export type CampaignEmailStats = {
  scheduled: number;
  queued: number;
  processing: number;
  sent: number;
  failed: number;
  total: number;
};

export type EmailCampaign = {
  id: string;
  subject: string;
  body: string;
  startAt: string;
  minDelayMs: number;
  hourlyQuota: number;
  status: CampaignStatus;
  idempotencyKey: string | null;
  recipientCount: number;
  stats: CampaignEmailStats;
  createdAt: string;
  updatedAt: string;
};

export type CreateCampaignInput = {
  subject: string;
  body: string;
  startAt: string;
  minDelayMs: number;
  hourlyQuota: number;
  recipients: string;
  idempotencyKey?: string;
};

export type CreateCampaignResult = EmailCampaign & {
  invalidLines?: Array<{ line: number; content: string; reason: string }>;
  idempotentReplay?: boolean;
};
