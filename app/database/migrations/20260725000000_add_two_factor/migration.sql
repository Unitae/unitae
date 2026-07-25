-- AlterTable
ALTER TABLE "UserAccount" ADD COLUMN "twoFactorSecret" TEXT;
ALTER TABLE "UserAccount" ADD COLUMN "twoFactorEnabledAt" TIMESTAMP(3);
