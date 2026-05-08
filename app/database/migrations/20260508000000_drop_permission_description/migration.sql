-- Drop the unused "description" column from "Permission". Translations are sourced from
-- Paraglide messages keyed by "Permission"."key", so the column carried no runtime value.

ALTER TABLE "Permission" DROP COLUMN "description";
