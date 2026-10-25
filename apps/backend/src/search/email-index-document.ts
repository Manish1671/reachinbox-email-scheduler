import type { Email } from '@prisma/client';

export const EMAIL_SEARCH_INDEX = 'emails';

export const BODY_SNIPPET_MAX_LENGTH = 500;

export type EmailSearchDocument = {
  emailId: string;
  userId: string;
  campaignId: string | null;
  recipient: string;
  subject: string;
  bodySnippet: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function buildEmailSearchDocument(email: Email): EmailSearchDocument {
  return {
    emailId: email.id,
    userId: email.userId,
    campaignId: email.campaignId,
    recipient: email.recipient,
    subject: email.subject,
    bodySnippet: email.body.slice(0, BODY_SNIPPET_MAX_LENGTH),
    status: email.status,
    scheduledAt: email.scheduledAt.toISOString(),
    sentAt: email.sentAt ? email.sentAt.toISOString() : null,
    createdAt: email.createdAt.toISOString(),
    updatedAt: email.updatedAt.toISOString(),
  };
}
