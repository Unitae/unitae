// Turns what a reader returns into the text a reference file holds. Ids change on every run, so each one becomes the
// fixture's label for it — `<member:paul>`, `<event:midweek-2>` — read from the key that holds it (`assigneeId` is a
// member, `eventId` an event); an id whose table the key does not say, or that the fixture never labelled, becomes
// `<id>`. Ids inside links and keys get the same treatment, and database timestamps become `<time>`. Everything else
// stays as returned, except `eventServiceParts`: the board readers fetch them with no ORDER BY, so they are sorted by
// name.

const VOLATILE_KEYS = new Set(['createdAt', 'updatedAt', 'processedAt', 'debounceUntil'])
const UNORDERED_KEYS = new Set(['eventServiceParts'])

/** The table an id key points at. */
const ID_TABLES: Record<string, string> = {
  assigneeId: 'member',
  assistantId: 'member',
  memberId: 'member',
  eventId: 'event',
  templateId: 'template',
  externalSpeakerId: 'speaker',
  speakerId: 'speaker',
  roleId: 'role',
  partId: 'templatePart',
  servicePartId: 'templateServicePart',
  presetId: 'preset',
  createdById: 'account',
  accountId: 'account',
  recipientId: 'account',
  actorId: 'account',
  inPersonById: 'account',
  onlineById: 'account',
  sectionId: 'section',
  eventPartId: 'eventPart',
  eventServicePartId: 'eventServicePart',
  userPartIds: 'eventPart',
  userServicePartIds: 'eventServicePart',
}
const ID_KEY = /(^id|Ids?)$/
/** A key made from an id, such as a record's `part-5301`. */
const ID_IN_KEY = /^([a-z]+)-\d+$/
const LINKED_IDS: [RegExp, string, string][] = [
  [/\/board\/dynamic\/(\d+)/g, 'document', '/board/dynamic/'],
  [/eventId=(\d+)/g, 'event', 'eventId='],
  [/\/programs\/events\/(\d+)/g, 'event', '/programs/events/'],
]

type Labels = ReadonlyMap<string, string>

function idLabel(id: unknown, table: string | undefined, labels: Labels): string {
  const name = table == null ? undefined : labels.get(`${table}:${String(id)}`)
  return name == null ? '<id>' : `<${table}:${name}>`
}

/** Ids inside links (a document, a meeting) become the fixture's label for them. */
export function relabelLinks(text: string, labels: Labels): string {
  return LINKED_IDS.reduce(
    (out, [pattern, table, prefix]) =>
      out.replace(pattern, (_, id: string) => `${prefix}${idLabel(id, table, labels)}`),
    text,
  )
}

export function normalise(value: unknown, key = '', labels: Labels = new Map()): unknown {
  if (value instanceof Date) return VOLATILE_KEYS.has(key) ? '<time>' : value.toISOString()
  if (value instanceof Map || value instanceof Set) {
    throw new Error(`« ${key} » is a ${value.constructor.name}: turn it into an object keyed by labels first`)
  }
  if (Array.isArray(value)) return normaliseList(value, key, labels)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalise(v, k, labels)]))
  }
  if (typeof value === 'number' && ID_KEY.test(key)) return idLabel(value, ID_TABLES[key], labels)
  if (typeof value === 'string') return normaliseText(value, key, labels)
  return value
}

function normaliseText(value: string, key: string, labels: Labels): string {
  if (VOLATILE_KEYS.has(key)) return '<time>'
  if (key === 'key') return value.replace(ID_IN_KEY, '$1-<id>')
  return relabelLinks(value, labels)
}

function normaliseList(value: unknown[], key: string, labels: Labels): unknown[] {
  if (ID_KEY.test(key)) return value.map(id => idLabel(id, ID_TABLES[key], labels))
  const items = UNORDERED_KEYS.has(key) ? [...value].sort(byName) : value
  return items.map(item => normalise(item, '', labels))
}

/**
 * Orders two texts by their code units: the same on every machine, unlike `localeCompare`, whose order follows the
 * process's locale — and a reference sorted one way locally and another on CI would fail for nothing.
 */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function byName(a: unknown, b: unknown): number {
  const name = (item: unknown) => String((item as { name?: unknown } | null)?.name ?? '')
  return compareText(name(a), name(b))
}

/** A reference file's content: stable JSON, two-space indented, ending with a newline. */
export function reference(value: unknown, labels: Labels = new Map()): string {
  return `${JSON.stringify(normalise(value, '', labels), null, 2)}\n`
}
