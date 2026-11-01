-- The interface language an account chose for itself. NULL means it follows its congregation's
-- (Congregation.locale): no backfill, and the deployed image, which never reads the column, keeps
-- working against it. Free text like Congregation.locale: the app ignores a locale it does not ship.
ALTER TABLE "UserAccount" ADD COLUMN "locale" TEXT;
