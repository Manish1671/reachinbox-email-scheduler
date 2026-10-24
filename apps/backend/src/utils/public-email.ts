import type { Email } from '@prisma/client';
import type { PublicEmail } from '../types/email';

export function toPublicEmail(email: Email): PublicEmail {
  return {
    id: email.id,
    recipient: email.recipient,
    subject: email.subject,
    body: email.body,
    status: email.status,
    scheduledAt: email.scheduledAt.toISOString(),
    sentAt: email.sentAt ? email.sentAt.toISOString() : null,
    failureReason: email.failureReason,
    campaignId: email.campaignId,
    sequenceIndex: email.sequenceIndex,
    createdAt: email.createdAt.toISOString(),
    updatedAt: email.updatedAt.toISOString(),
  };
}
