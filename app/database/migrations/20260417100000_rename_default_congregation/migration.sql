-- Replace hardcoded "Lyon Confluence" branding with generic defaults
-- matching the seed values used for new single-tenant installations.
UPDATE "Congregation"
SET "name"             = 'Ma Congrégation',
    "slug"             = 'ma-congregation',
    "domain"           = 'ma-congregation.example.com',
    "displayName"      = 'Ma Congrégation',
    "emailFromName"    = NULL,
    "emailFromAddress" = NULL,
    "baseUrl"          = NULL
WHERE "slug" = 'lyon-confluence';
