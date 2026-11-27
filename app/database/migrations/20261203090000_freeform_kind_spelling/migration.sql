-- The built-in freeform type seeded in French reads « Autre évènement », as « Types d’évènement » writes it.
-- Only the seeded name moves: a congregation that renamed it, another language, and its events keep theirs.
UPDATE "EventTemplate" SET "name" = 'Autre évènement' WHERE "key" = 'freeform' AND "name" = 'Autre événement';
