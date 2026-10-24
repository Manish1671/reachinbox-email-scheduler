import type { CampaignStatus } from '@prisma/client';

export type { CampaignStatus };

export type CampaignEmailStats = {
  scheduled: number;
  queued: number;
  processing: number;
  sent: number;
  failed: number;
  total: number;
};

export type PublicCampaign = {
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

export type CreateCampaignResult = PublicCampaign & {
  invalidLines?: Array<{ line: number; content: string; reason: string }>;
  idempotentReplay?: boolean;
};
