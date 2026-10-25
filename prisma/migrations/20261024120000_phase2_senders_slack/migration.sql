-- CreateEnum
CREATE TYPE "SmtpAccountKind" AS ENUM ('ENV', 'CUSTOM');

-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "smtpSenderAccountId" TEXT,
ADD COLUMN     "deferralReason" TEXT;

-- CreateTable
CREATE TABLE "SmtpSenderAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "SmtpAccountKind" NOT NULL DEFAULT 'CUSTOM',
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT NOT NULL,
    "passwordCipher" TEXT,
    "mailFrom" TEXT NOT NULL,
    "hourlyQuota" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmtpSenderAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackConnection" (
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT,
    "channelId" TEXT,
    "channelName" TEXT,
    "accessTokenCipher" TEXT NOT NULL,
    "incomingWebhookCipher" TEXT,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackConnection_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "SmtpSenderAccount_userId_idx" ON "SmtpSenderAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SmtpSenderAccount_userId_label_key" ON "SmtpSenderAccount"("userId", "label");

-- CreateIndex
CREATE INDEX "Email_smtpSenderAccountId_idx" ON "Email"("smtpSenderAccountId");

-- AddForeignKey
ALTER TABLE "SmtpSenderAccount" ADD CONSTRAINT "SmtpSenderAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackConnection" ADD CONSTRAINT "SlackConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_smtpSenderAccountId_fkey" FOREIGN KEY ("smtpSenderAccountId") REFERENCES "SmtpSenderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
