export type EmailStatus = 'SCHEDULED' | 'QUEUED' | 'PROCESSING' | 'SENT' | 'FAILED';

export type ScheduledEmail = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateEmailInput = {
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
};
