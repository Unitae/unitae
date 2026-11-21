// The eight old item tables and the four new ones (plan T12), each read into one shape so a test can compare them: rows
// keyed by the old row they come from (`part:<id>`, `service:<id>`), a template item referred to by that key too, so
// the new ids never matter. Services read as items with the programme columns at their defaults.

interface RawQuery {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
}

export interface ItemTables {
  templateItems: Record<string, unknown>[]
  templateItemRoles: Record<string, unknown>[]
  items: Record<string, unknown>[]
  itemRoles: Record<string, unknown>[]
}

const TEMPLATE_COLUMNS = `"name", "key", "section", "track", "trackOrder", "order", "durationMin", "allowExternalSpeaker",
  "speakerLabel", "readerLabel", "templateId", "scheduleTemplateId", "presetId"`
const ITEM_COLUMNS = `"name", "order", "topic", "note", "hasConflict", "section", "track", "trackOrder", "durationMin",
  "speakerLabel", "readerLabel", "eventId", "scheduleId", "presetId", "assigneeId", "assistantId", "allowExternalSpeaker",
  "externalSpeakerId", "createdAt", "updatedAt"`

const OLD = {
  templateItems: `
    SELECT 'part:' || "id" AS "k", ${TEMPLATE_COLUMNS} FROM (
      SELECT p.*, NULL::text AS "key" FROM "TemplatePart" p WHERE p."congregationId" = $1) t
    UNION ALL
    SELECT 'service:' || "id", "name", "key", '', '', NULL, "order", NULL, false, NULL, NULL, "templateId",
      "scheduleTemplateId", "presetId"
    FROM "TemplateServicePart" WHERE "congregationId" = $1`,
  templateItemRoles: `
    SELECT 'part:' || "partId" AS "k", "roleId", CASE "asKind" WHEN 'speaker' THEN 'main' WHEN 'reader' THEN 'second'
      ELSE "asKind" END AS "slot"
    FROM "TemplatePartAllowedRole" WHERE "congregationId" = $1
    UNION ALL
    SELECT 'service:' || "servicePartId", "roleId", 'main' FROM "TemplateServicePartAllowedRole"
    WHERE "congregationId" = $1`,
  items: `
    SELECT 'part:' || "id" AS "k", 'part:' || "partId" AS "template", ${ITEM_COLUMNS}
    FROM "EventPart" WHERE "congregationId" = $1
    UNION ALL
    SELECT 'service:' || "id", 'service:' || "servicePartId", "name", "order", '', "note", "hasConflict", '', '', NULL,
      NULL, NULL, NULL, "eventId", "scheduleId", "presetId", "assigneeId", NULL, false, NULL, "createdAt", "updatedAt"
    FROM "EventServicePart" WHERE "congregationId" = $1`,
  itemRoles: `
    SELECT 'part:' || "eventPartId" AS "k", "roleId", CASE "asKind" WHEN 'speaker' THEN 'main'
      WHEN 'reader' THEN 'second' ELSE "asKind" END AS "slot"
    FROM "EventPartAllowedRole" WHERE "congregationId" = $1
    UNION ALL
    SELECT 'service:' || "eventServicePartId", "roleId", 'main' FROM "EventServicePartAllowedRole"
    WHERE "congregationId" = $1`,
}

const LEGACY_KEY = (alias: string) =>
  `CASE WHEN ${alias}."legacyPartId" IS NOT NULL THEN 'part:' || ${alias}."legacyPartId"
    ELSE 'service:' || ${alias}."legacyServiceId" END`

const NEW = {
  templateItems: `
    SELECT ${LEGACY_KEY('ti')} AS "k", ${TEMPLATE_COLUMNS.replace(/"(\w+)"/g, 'ti."$1"')}
    FROM "TemplateItem" ti WHERE ti."congregationId" = $1`,
  templateItemRoles: `
    SELECT ${LEGACY_KEY('ti')} AS "k", r."roleId", r."slot"
    FROM "TemplateItemAllowedRole" r JOIN "TemplateItem" ti ON ti."id" = r."itemId" WHERE r."congregationId" = $1`,
  items: `
    SELECT ${LEGACY_KEY('i')} AS "k", CASE WHEN ti."id" IS NULL THEN NULL ELSE ${LEGACY_KEY('ti')} END AS "template",
      ${ITEM_COLUMNS.replace(/"(\w+)"/g, 'i."$1"')}
    FROM "Item" i LEFT JOIN "TemplateItem" ti ON ti."id" = i."templateItemId" WHERE i."congregationId" = $1`,
  itemRoles: `
    SELECT ${LEGACY_KEY('i')} AS "k", r."roleId", r."slot"
    FROM "ItemAllowedRole" r JOIN "Item" i ON i."id" = r."itemId" WHERE r."congregationId" = $1`,
}

const sortKey = (row: Record<string, unknown>) => JSON.stringify(row)

async function read(db: RawQuery, queries: Record<keyof ItemTables, string>, congregationId: number) {
  const tables = {} as ItemTables
  for (const name of Object.keys(queries) as (keyof ItemTables)[]) {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(queries[name], congregationId)
    tables[name] = rows.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  }
  return tables
}

/** The old tables of a congregation, as the new ones should hold them. */
export const readOldItems = (db: RawQuery, congregationId: number) => read(db, OLD, congregationId)

/** The new tables of a congregation. */
export const readNewItems = (db: RawQuery, congregationId: number) => read(db, NEW, congregationId)
