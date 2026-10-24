import { CampaignStatus, EmailStatus, Prisma } from '@prisma/client';
import { DEFAULT_CAMPAIGN_LIST_LIMIT } from '../config/constants';
import { prisma } from '../db/prisma';
import * as emailQueue from '../queue/email.queue';
import type { CreateCampaignResult, PublicCampaign } from '../types/campaign';
import { AppError } from '../utils/app-error';
import { parseRecipientsInput, RecipientParseError } from '../utils/campaign-recipients';
import { calculateStaggeredScheduledAt } from '../utils/campaign-schedule';
import { logger } from '../utils/logger';
import {
  deriveCampaignStatusFromEmails,
  toPublicCampaign,
} from '../utils/public-campaign';
import { getCampaignByIdForUser } from './campaign.access';
import type { EnqueueEmailJob } from './email.service';

export type CreateCampaignInput = {
  subject: string;
  body: string;
  startAt: Date;
  minDelayMs: number;
  hourlyQuota: number;
  recipients: string;
  idempotencyKey?: string;
};

async function loadCampaignPublic(campaignId: string, ownerId: string): Promise<PublicCampaign> {
  const campaign = await getCampaignByIdForUser(campaignId, ownerId);
  const emails = await prisma.email.findMany({
    where: { campaignId: campaign.id },
    select: { status: true },
    orderBy: { sequenceIndex: 'asc' },
  });
  return toPublicCampaign(campaign, emails);
}

async function persistCampaignStatus(
  campaignId: string,
  emails: { status: EmailStatus }[],
): Promise<void> {
  const campaign = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: campaignId } });
  const status = deriveCampaignStatusFromEmails(emails, campaign.status);
  if (status !== campaign.status) {
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status },
    });
  }
}

export async function enqueueScheduledCampaignEmails(
  campaignId: string,
  enqueue: EnqueueEmailJob = emailQueue.addSendEmailJob,
): Promise<{ enqueued: number; failed: number }> {
  const emails = await prisma.email.findMany({
    where: { campaignId, status: EmailStatus.SCHEDULED },
    orderBy: { sequenceIndex: 'asc' },
  });

  let enqueued = 0;
  let failed = 0;

  for (const email of emails) {
    try {
      await enqueue(email.id, email.scheduledAt);
      const updated = await prisma.email.updateMany({
        where: { id: email.id, status: EmailStatus.SCHEDULED },
        data: { status: EmailStatus.QUEUED },
      });
      if (updated.count === 1) {
        enqueued += 1;
      }
    } catch (error) {
      failed += 1;
      logger.error('Campaign email enqueue failed', { campaignId, emailId: email.id, error });
    }
  }

  const allEmails = await prisma.email.findMany({
    where: { campaignId },
    select: { status: true },
  });
  await persistCampaignStatus(campaignId, allEmails);

  return { enqueued, failed };
}

export async function createCampaign(
  ownerId: string,
  input: CreateCampaignInput,
  enqueue: EnqueueEmailJob = emailQueue.addSendEmailJob,
): Promise<CreateCampaignResult> {
  if (input.idempotencyKey) {
    const existing = await prisma.emailCampaign.findFirst({
      where: { userId: ownerId, idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      await enqueueScheduledCampaignEmails(existing.id, enqueue);
      const campaign = await loadCampaignPublic(existing.id, ownerId);
      return { ...campaign, idempotentReplay: true };
    }
  }

  let parsed;
  try {
    parsed = parseRecipientsInput(input.recipients);
  } catch (error) {
    if (error instanceof RecipientParseError) {
      throw new AppError(error.code, error.message, 400);
    }
    throw error;
  }

  if (input.startAt.getTime() <= Date.now()) {
    throw new AppError('INVALID_SCHEDULE_TIME', 'startAt must be in the future', 400);
  }

  const lastScheduledAt = calculateStaggeredScheduledAt(
    input.startAt,
    parsed.recipients.length - 1,
    input.minDelayMs,
  );
  if (lastScheduledAt.getTime() <= Date.now()) {
    throw new AppError(
      'INVALID_SCHEDULE_TIME',
      'The last recipient send time must be in the future',
      400,
    );
  }

  let campaignId: string;

  try {
    campaignId = await prisma.$transaction(async (tx) => {
      const campaign = await tx.emailCampaign.create({
        data: {
          userId: ownerId,
          subject: input.subject,
          body: input.body,
          startAt: input.startAt,
          minDelayMs: input.minDelayMs,
          hourlyQuota: input.hourlyQuota,
          idempotencyKey: input.idempotencyKey ?? null,
          recipientCount: parsed.recipients.length,
          status: CampaignStatus.SCHEDULED,
        },
      });

      await tx.email.createMany({
        data: parsed.recipients.map((recipient, index) => ({
          userId: ownerId,
          campaignId: campaign.id,
          sequenceIndex: index,
          recipient,
          subject: input.subject,
          body: input.body,
          scheduledAt: calculateStaggeredScheduledAt(input.startAt, index, input.minDelayMs),
          status: EmailStatus.SCHEDULED,
        })),
      });

      return campaign.id;
    });
  } catch (error) {
    if (
      input.idempotencyKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await prisma.emailCampaign.findFirstOrThrow({
        where: { userId: ownerId, idempotencyKey: input.idempotencyKey },
      });
      await enqueueScheduledCampaignEmails(existing.id, enqueue);
      const campaign = await loadCampaignPublic(existing.id, ownerId);
      return {
        ...campaign,
        invalidLines: parsed.invalidLines.length > 0 ? parsed.invalidLines : undefined,
        idempotentReplay: true,
      };
    }
    throw error;
  }

  const enqueueSummary = await enqueueScheduledCampaignEmails(campaignId, enqueue);

  if (enqueueSummary.failed > 0 && enqueueSummary.enqueued === 0) {
    throw new AppError(
      'QUEUE_ENQUEUE_FAILED',
      'Campaign was saved but no emails could be queued. They remain scheduled for later recovery.',
      503,
      { campaignId, failed: enqueueSummary.failed },
    );
  }

  const campaign = await loadCampaignPublic(campaignId, ownerId);

  logger.info('Created campaign', {
    campaignId,
    recipientCount: parsed.recipients.length,
    enqueued: enqueueSummary.enqueued,
    enqueueFailed: enqueueSummary.failed,
  });

  return {
    ...campaign,
    invalidLines: parsed.invalidLines.length > 0 ? parsed.invalidLines : undefined,
    idempotentReplay: false,
  };
}

export async function listCampaignsForUser(
  ownerId: string,
  limit = DEFAULT_CAMPAIGN_LIST_LIMIT,
): Promise<PublicCampaign[]> {
  const campaigns = await prisma.emailCampaign.findMany({
    where: { userId: ownerId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const results: PublicCampaign[] = [];
  for (const campaign of campaigns) {
    const emails = await prisma.email.findMany({
      where: { campaignId: campaign.id },
      select: { status: true },
    });
    results.push(toPublicCampaign(campaign, emails));
  }

  return results;
}

export async function getOwnedCampaign(
  campaignId: string,
  ownerId: string,
): Promise<PublicCampaign> {
  return loadCampaignPublic(campaignId, ownerId);
}
