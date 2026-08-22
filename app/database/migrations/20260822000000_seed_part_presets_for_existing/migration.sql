-- Gives congregations that predate part presets the default kinds.
--
-- Congregations are seeded once, at registration, so anything created before
-- presets existed would otherwise never receive them — in multi-tenant mode
-- there is no second pass. This is that pass, run once at deploy.
--
-- Generated from seedDefaultPartPresets rather than transcribed, by capturing
-- the rows it writes, so the wording here matches the catalogue exactly. Like
-- any data migration it is a point-in-time snapshot: congregations created
-- afterwards get theirs from seeding, and a kind added to the catalogue later
-- will not reach existing congregations through this file.
--
-- ON CONFLICT DO NOTHING makes it safe against a congregation that already has
-- some of these — the unique key is (key, congregationId).
--
-- Rows are marked isSystem so they cannot be deleted, matching what seeding
-- does for a new congregation. No parts are linked: a part with no kind simply
-- has no share button, and choosing one is a decision per part.

INSERT INTO "PartPreset" ("key", "name", "scope", "hasReaderSlot", "speakerLabel", "readerLabel", "allowExternalSpeaker", "shareMessage", "isSystem", "congregationId", "updatedAt")
SELECT d.key, d.name, d.scope, d.has_reader, d.speaker_label, d.reader_label, d.allow_external, d.share_message, true, c.id, CURRENT_TIMESTAMP
FROM "Congregation" c
CROSS JOIN (VALUES
    ('prayer', 'Prière', 'part', false, 'Frère', NULL, true, 'Bonjour {{assigneeFirstname}},

Tu as la prière le {{date}} à {{time}} ({{eventName}}).

{{link}}'),
    ('chairman', 'Présidence', 'part', false, 'Président', NULL, false, 'Bonjour {{assigneeFirstname}},

Tu présides la réunion du {{date}} à {{time}}.

{{link}}'),
    ('spiritual-gems', 'Joyaux spirituels', 'part', false, 'Orateur', NULL, false, 'Bonjour {{assigneeFirstname}},

Tu as un discours dans les Joyaux de la Parole de Dieu le {{date}} à {{time}}.
Sujet : {{topic}}
Durée : {{duration}}
Note : {{note}}

{{link}}'),
    ('spiritual-pearls', 'Perles spirituelles', 'part', false, 'Conducteur', NULL, false, 'Bonjour {{assigneeFirstname}},

Tu conduis « Recherchons des perles spirituelles » le {{date}} à {{time}}.
Durée : {{duration}}
Note : {{note}}

{{link}}'),
    ('bible-reading', 'Lecture de la Bible', 'part', false, 'Lecteur', NULL, false, 'Bonjour {{assigneeFirstname}},

Tu as la lecture de la Bible le {{date}} à {{time}}.
Passage : {{topic}}
Durée : {{duration}}
Note : {{note}}

{{link}}'),
    ('school-demonstration', 'Sujet de l''école', 'part', true, 'Proclamateur', 'Interlocuteur', false, 'Bonjour {{assigneeFirstname}},

Tu as un sujet de l''école le {{date}} à {{time}}.
Sujet : {{topic}}
Durée : {{duration}}
Avec : {{assistant}}
Note : {{note}}

{{link}}'),
    ('school-talk', 'Discours de l''école', 'part', false, 'Orateur', NULL, false, 'Bonjour {{assigneeFirstname}},

Tu as un discours de l''école le {{date}} à {{time}}.
Sujet : {{topic}}
Durée : {{duration}}
Note : {{note}}

{{link}}'),
    ('christian-life-talk', 'Discours VCM', 'part', false, 'Orateur', NULL, true, 'Bonjour {{assigneeFirstname}},

Tu as un discours dans « Vie chrétienne » le {{date}} à {{time}}.
Sujet : {{topic}}
Durée : {{duration}}
Note : {{note}}

{{link}}'),
    ('public-talk', 'Discours public', 'part', false, 'Orateur', NULL, true, 'Bonjour {{assigneeFirstname}},

Tu donnes le discours public le {{date}} à {{time}}.
Thème : {{topic}}
Note : {{note}}

{{link}}'),
    ('watchtower-study', 'Étude de La Tour de Garde', 'part', true, 'Conducteur', 'Lecteur', false, 'Bonjour {{assigneeFirstname}},

Tu conduis l''Étude de La Tour de Garde le {{date}} à {{time}}.
Lecteur : {{assistant}}
Note : {{note}}

{{link}}'),
    ('congregation-bible-study', 'Étude biblique de l''assemblée', 'part', true, 'Conducteur', 'Lecteur', false, 'Bonjour {{assigneeFirstname}},

Tu conduis l''étude biblique de l''assemblée le {{date}} à {{time}}.
Lecteur : {{assistant}}
Note : {{note}}

{{link}}')
) AS d(key, name, scope, has_reader, speaker_label, reader_label, allow_external, share_message)
WHERE c.locale IS NULL OR c.locale <> 'en'
ON CONFLICT ("key", "congregationId") DO NOTHING;

INSERT INTO "PartPreset" ("key", "name", "scope", "hasReaderSlot", "speakerLabel", "readerLabel", "allowExternalSpeaker", "shareMessage", "isSystem", "congregationId", "updatedAt")
SELECT d.key, d.name, d.scope, d.has_reader, d.speaker_label, d.reader_label, d.allow_external, d.share_message, true, c.id, CURRENT_TIMESTAMP
FROM "Congregation" c
CROSS JOIN (VALUES
    ('prayer', 'Prayer', 'part', false, 'Brother', NULL, true, 'Hi {{assigneeFirstname}},

You have the prayer on {{date}} at {{time}} ({{eventName}}).

{{link}}'),
    ('chairman', 'Chairman', 'part', false, 'Chairman', NULL, false, 'Hi {{assigneeFirstname}},

You are chairing the meeting on {{date}} at {{time}}.

{{link}}'),
    ('spiritual-gems', 'Spiritual Gems', 'part', false, 'Speaker', NULL, false, 'Hi {{assigneeFirstname}},

You have a talk in Treasures From God''s Word on {{date}} at {{time}}.
Topic: {{topic}}
Length: {{duration}}
Note: {{note}}

{{link}}'),
    ('spiritual-pearls', 'Digging for Spiritual Gems', 'part', false, 'Conductor', NULL, false, 'Hi {{assigneeFirstname}},

You are conducting Digging for Spiritual Gems on {{date}} at {{time}}.
Length: {{duration}}
Note: {{note}}

{{link}}'),
    ('bible-reading', 'Bible Reading', 'part', false, 'Reader', NULL, false, 'Hi {{assigneeFirstname}},

You have the Bible reading on {{date}} at {{time}}.
Passage: {{topic}}
Length: {{duration}}
Note: {{note}}

{{link}}'),
    ('school-demonstration', 'School Demonstration', 'part', true, 'Publisher', 'Counterpart', false, 'Hi {{assigneeFirstname}},

You have a school demonstration on {{date}} at {{time}}.
Topic: {{topic}}
Length: {{duration}}
With: {{assistant}}
Note: {{note}}

{{link}}'),
    ('school-talk', 'School Talk', 'part', false, 'Speaker', NULL, false, 'Hi {{assigneeFirstname}},

You have a school talk on {{date}} at {{time}}.
Topic: {{topic}}
Length: {{duration}}
Note: {{note}}

{{link}}'),
    ('christian-life-talk', 'Christian Living Talk', 'part', false, 'Speaker', NULL, true, 'Hi {{assigneeFirstname}},

You have a talk in Living as Christians on {{date}} at {{time}}.
Topic: {{topic}}
Length: {{duration}}
Note: {{note}}

{{link}}'),
    ('public-talk', 'Public Talk', 'part', false, 'Speaker', NULL, true, 'Hi {{assigneeFirstname}},

You are giving the public talk on {{date}} at {{time}}.
Theme: {{topic}}
Note: {{note}}

{{link}}'),
    ('watchtower-study', 'Watchtower Study', 'part', true, 'Conductor', 'Reader', false, 'Hi {{assigneeFirstname}},

You are conducting the Watchtower Study on {{date}} at {{time}}.
Reader: {{assistant}}
Note: {{note}}

{{link}}'),
    ('congregation-bible-study', 'Congregation Bible Study', 'part', true, 'Conductor', 'Reader', false, 'Hi {{assigneeFirstname}},

You are conducting the Congregation Bible Study on {{date}} at {{time}}.
Reader: {{assistant}}
Note: {{note}}

{{link}}')
) AS d(key, name, scope, has_reader, speaker_label, reader_label, allow_external, share_message)
WHERE c.locale = 'en'
ON CONFLICT ("key", "congregationId") DO NOTHING;
