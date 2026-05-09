-- Built-in domain roles (male, female, baptized, anointed, elder, assistant-servant)
-- now require isPublisher = true at the application layer. Phase 2's backfill assigned
-- these roles purely from User booleans without that gate, leaving non-publisher
-- accounts (admin-only, validator-only) tagged as elders/servants/etc.
--
-- Strip every assignment for a built-in role other than `publisher` itself when the
-- user is not an active publisher. Idempotent: subsequent runs find no matching rows.

DELETE FROM "UserRoleAssignment" ura
USING "Role" r, "User" u
WHERE ura."roleId" = r."id"
  AND ura."userId" = u."id"
  AND r."isBuiltIn" = true
  AND r."key" <> 'publisher'
  AND u."isPublisher" = false;
