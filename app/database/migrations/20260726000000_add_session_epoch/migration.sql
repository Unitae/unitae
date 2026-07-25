-- Session epoch: embedded in the session cookie and compared on every request in
-- verifySession. Incremented on password change/reset and on admin invalidation to
-- revoke all previously-issued sessions ("log out everywhere"). Existing rows default
-- to 0 so cookies issued before this migration stay valid until the first bump.

-- AlterTable
ALTER TABLE "UserAccount" ADD COLUMN "sessionEpoch" INTEGER NOT NULL DEFAULT 0;
