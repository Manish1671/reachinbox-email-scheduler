-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "name" TEXT,
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "googleSubject" TEXT;

-- CreateTable
CREATE TABLE "EmailSearchOutbox" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSearchOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSubject_key" ON "User"("googleSubject");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSearchOutbox_emailId_key" ON "EmailSearchOutbox"("emailId");

-- CreateIndex
CREATE INDEX "EmailSearchOutbox_updatedAt_idx" ON "EmailSearchOutbox"("updatedAt");

-- AddForeignKey
ALTER TABLE "EmailSearchOutbox" ADD CONSTRAINT "EmailSearchOutbox_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;
