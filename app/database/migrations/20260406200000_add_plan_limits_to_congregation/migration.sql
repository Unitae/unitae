-- AlterTable
ALTER TABLE "Congregation" ADD COLUMN "plan" TEXT;
ALTER TABLE "Congregation" ADD COLUMN "maxPublishers" INTEGER;
ALTER TABLE "Congregation" ADD COLUMN "maxTerritories" INTEGER;
ALTER TABLE "Congregation" ADD COLUMN "maxUsers" INTEGER;
ALTER TABLE "Congregation" ADD COLUMN "maxStorageBytes" BIGINT;
ALTER TABLE "Congregation" ADD COLUMN "maxBoardDocuments" INTEGER;
ALTER TABLE "Congregation" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Congregation" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Congregation" ADD COLUMN "suspendedReason" TEXT;
ALTER TABLE "Congregation" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "Congregation" ADD COLUMN "stripeSubscriptionId" TEXT;
