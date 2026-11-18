// Turns what a reader returns into the text a reference file holds: ids and creation timestamps change on every run,
// so they are blanked; everything else — names, days, order, flags — stays exactly as returned, except the lists today's
// readers return in no defined order (services are read without an ORDER BY), which are sorted so a reference never
// depends on the order the database happened to return.

const ID_KEY = /Ids?$/
/** A key made from an id, such as a record's `part-5301`. */
const ID_IN_KEY = /^([a-z]+)-\d+$/
const VOLATILE_KEYS = new Set(['createdAt', 'updatedAt', 'processedAt', 'debounceUntil'])
const UNORDERED_KEYS = new Set(['eventServiceParts'])
const LINKED_IDS: [RegExp, string, (label: string) => string][] = [
  [/\/board\/dynamic\/(\d+)/g, 'document', label => `/board/dynamic/<${label}>`],
  [/eventId=(\d+)/g, 'event', label => `eventId=<${label}>`],
  [/\/programs\/events\/(\d+)/g, 'event', label => `/programs/events/<${label}>`],
]

function byName(a: unknown, b: unknown): number {
  const name = (item: unknown) => String((item as { name?: unknown } | null)?.name ?? '')
  return name(a).localeCompare(name(b))
}

function isIdKey(key: string): boolean {
  return key === 'id' || ID_KEY.test(key)
}

/** Ids inside links (a document, a meeting) become the fixture's label for them. */
export function relabelLinks(text: string, labels: ReadonlyMap<string, string>): string {
  return LINKED_IDS.reduce(
    (out, [pattern, table, write]) =>
      out.replace(pattern, (_, id: string) => write(labels.get(`${table}:${id}`) ?? '?')),
    text,
  )
}

export function normalise(value: unknown, key = '', labels: ReadonlyMap<string, string> = new Map()): unknown {
  if (value instanceof Date) return VOLATILE_KEYS.has(key) ? '<time>' : value.toISOString()
  if (Array.isArray(value)) return normaliseList(value, key, labels)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalise(v, k, labels)]))
  }
  if (typeof value === 'number' && isIdKey(key)) return '<id>'
  if (typeof value === 'string') return normaliseText(value, key, labels)
  return value
}

function normaliseText(value: string, key: string, labels: ReadonlyMap<string, string>): string {
  if (VOLATILE_KEYS.has(key)) return '<time>'
  if (key === 'key') return value.replace(ID_IN_KEY, '$1-<id>')
  return relabelLinks(value, labels)
}

function normaliseList(value: unknown[], key: string, labels: ReadonlyMap<string, string>): unknown[] {
  if (isIdKey(key)) return value.map(() => '<id>')
  const items = UNORDERED_KEYS.has(key) ? [...value].sort(byName) : value
  return items.map(item => normalise(item, '', labels))
}

/** A reference file's content: stable JSON, two-space indented, ending with a newline. */
export function reference(value: unknown, labels: ReadonlyMap<string, string> = new Map()): string {
  return `${JSON.stringify(normalise(value, '', labels), null, 2)}\n`
}
