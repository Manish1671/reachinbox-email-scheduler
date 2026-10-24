-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('SCHEDULED', 'QUEUED', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "minDelayMs" INTEGER NOT NULL,
    "hourlyQuota" INTEGER NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'SCHEDULED',
    "idempotencyKey" TEXT,
    "recipientCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "sequenceIndex" INTEGER;

-- CreateIndex
CREATE INDEX "EmailCampaign_userId_idx" ON "EmailCampaign"("userId");

-- CreateIndex
CREATE INDEX "EmailCampaign_userId_createdAt_idx" ON "EmailCampaign"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailCampaign_userId_idempotencyKey_key" ON "EmailCampaign"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Email_campaignId_idx" ON "Email"("campaignId");

-- CreateIndex
CREATE INDEX "Email_campaignId_sequenceIndex_idx" ON "Email"("campaignId", "sequenceIndex");

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
