-- When an account closed the dashboard's "Premiers pas" checklist. NULL means it never did: no
-- backfill, and the deployed image, which never reads the column, keeps working against it.
ALTER TABLE "UserAccount" ADD COLUMN "onboardingDismissedAt" TIMESTAMP(3);
