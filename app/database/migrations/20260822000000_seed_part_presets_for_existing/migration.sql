-- Gives congregations that predate part presets the default kinds.
--
-- Congregations are seeded once, at registration, so anything created before
-- presets existed would otherwise never receive them — in multi-tenant mode
-- there is no second pass. This is that pass, run once at deploy.
--
-- Nothing language-specific is stored. Names, slot labels and share messages
-- are null, and the wording comes from the message catalogue at render time —
-- the convention Role already uses for its built-in rows. That is why this file
-- carries no French or English text and needs no branch on Congregation.locale:
-- a congregation that switches language sees its kinds switch with it.
--
-- ON CONFLICT DO NOTHING makes it safe for a congregation that already holds
-- some of these, and safe to re-run. The unique key is (key, congregationId).
--
-- Rows are marked isSystem so they cannot be deleted, matching what seeding
-- does for a new congregation. No parts are linked: a part with no kind simply
-- has no share button, and choosing one is a decision per part.

-- Wording becomes optional so it can be resolved from the message catalogue.
-- Null on a seeded kind means "use the built-in text for the current locale";
-- a congregation that renames one stores its own and that wins. shareMessage
-- loses its '' default for the same reason — null and empty now mean different
-- things (never set, versus deliberately cleared).
ALTER TABLE "PartPreset" ALTER COLUMN "name" DROP NOT NULL,
                         ALTER COLUMN "shareMessage" DROP NOT NULL,
                         ALTER COLUMN "shareMessage" DROP DEFAULT;

INSERT INTO "PartPreset" ("key", "scope", "hasReaderSlot", "allowExternalSpeaker", "isSystem", "congregationId", "updatedAt")
SELECT d.key, 'part', d.has_reader, d.allow_external, true, c.id, CURRENT_TIMESTAMP
FROM "Congregation" c
CROSS JOIN (VALUES
    ('prayer', false, true),
    ('chairman', false, false),
    ('spiritual-gems', false, false),
    ('spiritual-pearls', false, false),
    ('bible-reading', false, false),
    ('school-demonstration', true, false),
    ('school-talk', false, false),
    ('christian-life-talk', false, true),
    ('public-talk', false, true),
    ('watchtower-study', true, false),
    ('congregation-bible-study', true, false)
) AS d(key, has_reader, allow_external)
ON CONFLICT ("key", "congregationId") DO NOTHING;
