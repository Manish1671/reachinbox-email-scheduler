import type { CampaignStatus, Email, EmailCampaign } from '@prisma/client';
import { EmailStatus } from '@prisma/client';
import type { CampaignEmailStats, PublicCampaign } from '../types/campaign';

export function buildCampaignEmailStats(emails: Pick<Email, 'status'>[]): CampaignEmailStats {
  const stats: CampaignEmailStats = {
    scheduled: 0,
    queued: 0,
    processing: 0,
    sent: 0,
    failed: 0,
    total: emails.length,
  };

  for (const email of emails) {
    switch (email.status) {
      case EmailStatus.SCHEDULED:
        stats.scheduled += 1;
        break;
      case EmailStatus.QUEUED:
        stats.queued += 1;
        break;
      case EmailStatus.PROCESSING:
        stats.processing += 1;
        break;
      case EmailStatus.SENT:
        stats.sent += 1;
        break;
      case EmailStatus.FAILED:
        stats.failed += 1;
        break;
      default:
        break;
    }
  }

  return stats;
}

export function deriveCampaignStatusFromEmails(
  emails: Pick<Email, 'status'>[],
  storedStatus: CampaignStatus,
): CampaignStatus {
  if (emails.length === 0) {
    return storedStatus;
  }

  const stats = buildCampaignEmailStats(emails);
  const pending = stats.scheduled + stats.queued + stats.processing;

  if (pending > 0) {
    if (stats.scheduled > 0) {
      return 'SCHEDULED';
    }
    return 'QUEUED';
  }

  if (stats.sent === stats.total) {
    return 'COMPLETED';
  }

  if (stats.failed === stats.total) {
    return 'FAILED';
  }

  return 'PARTIAL';
}

export function toPublicCampaign(
  campaign: EmailCampaign,
  emails: Pick<Email, 'status'>[],
): PublicCampaign {
  const stats = buildCampaignEmailStats(emails);

  return {
    id: campaign.id,
    subject: campaign.subject,
    body: campaign.body,
    startAt: campaign.startAt.toISOString(),
    minDelayMs: campaign.minDelayMs,
    hourlyQuota: campaign.hourlyQuota,
    status: deriveCampaignStatusFromEmails(emails, campaign.status),
    idempotencyKey: campaign.idempotencyKey,
    recipientCount: campaign.recipientCount,
    stats,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}
