import type { EmailCampaign } from '@prisma/client';
import { prisma } from '../db/prisma';
import { AppError } from '../utils/app-error';

export async function getCampaignByIdForUser(
  campaignId: string,
  ownerId: string,
): Promise<EmailCampaign> {
  const campaign = await prisma.emailCampaign.findFirst({
    where: { id: campaignId, userId: ownerId },
  });

  if (!campaign) {
    throw new AppError('CAMPAIGN_NOT_FOUND', 'Campaign not found', 404);
  }

  return campaign;
}
