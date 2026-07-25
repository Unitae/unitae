-- Password-reset and email-verification tokens are now persisted as SHA-256
-- hashes instead of verbatim (see issue #285). Any rows written before this
-- migration hold plaintext tokens, which:
--   1. are the exact DB-read exposure this change closes, and
--   2. can no longer be matched — lookups now hash the incoming token first,
--      so a stored plaintext value would never resolve anyway.
--
-- Delete them outright. Both token types are short-lived (24 h expiry) and
-- single-use; users simply re-request a reset or verification email. No data
-- worth preserving is lost.
--
-- The calendar-feed token is intentionally left untouched — it stays plaintext
-- by design so its subscription URL remains displayable on the profile page.

DELETE FROM "PasswordResetToken";
DELETE FROM "EmailVerificationToken";
