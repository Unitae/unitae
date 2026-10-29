-- How a dynamic board document looks, on the board and on paper: a typeface, an accent and a
-- layout, each from a short list the app validates. NULL means the defaults (Fira Sans, teal,
-- the document's first layout): no backfill, and the deployed image, which never reads the
-- column, keeps working against it.
ALTER TABLE "BoardDynamicDocumentSettings" ADD COLUMN "appearance" JSONB;

-- The app reads it field by field; anything but an object would be a bug, not an appearance.
ALTER TABLE "BoardDynamicDocumentSettings" ADD CONSTRAINT "BoardDynamicDocumentSettings_appearance_object"
  CHECK ("appearance" IS NULL OR jsonb_typeof("appearance") = 'object');
