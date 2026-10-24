import { EmailStatus } from '@prisma/client';

export type { EmailStatus };

export type PublicEmail = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  failureReason: string | null;
  campaignId: string | null;
  sequenceIndex: number | null;
  createdAt: string;
  updatedAt: string;
};
