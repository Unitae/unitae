// Turns what a reader returns into the text a reference file holds: ids and creation timestamps change on every run,
// so they are blanked; everything else — names, days, order, flags — stays exactly as returned, except the lists today's
// readers return in no defined order (services are read without an ORDER BY), which are sorted so a reference never
// depends on the order the database happened to return.

const ID_KEY = /Ids?$/
const VOLATILE_KEYS = new Set(['createdAt', 'updatedAt', 'processedAt', 'debounceUntil'])
const UNORDERED_KEYS = new Set(['eventServiceParts'])

function byName(a: unknown, b: unknown): number {
  const name = (item: unknown) => String((item as { name?: unknown } | null)?.name ?? '')
  return name(a).localeCompare(name(b))
}

function isIdKey(key: string): boolean {
  return key === 'id' || ID_KEY.test(key)
}

export function normalise(value: unknown, key = ''): unknown {
  if (value instanceof Date) return VOLATILE_KEYS.has(key) ? '<time>' : value.toISOString()
  if (Array.isArray(value)) return normaliseList(value, key)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalise(v, k)]))
  }
  if (typeof value === 'number' && isIdKey(key)) return '<id>'
  if (typeof value === 'string' && VOLATILE_KEYS.has(key)) return '<time>'
  return value
}

function normaliseList(value: unknown[], key: string): unknown[] {
  if (isIdKey(key)) return value.map(() => '<id>')
  const items = UNORDERED_KEYS.has(key) ? [...value].sort(byName) : value
  return items.map(item => normalise(item))
}

/** A reference file's content: stable JSON, two-space indented, ending with a newline. */
export function reference(value: unknown): string {
  return `${JSON.stringify(normalise(value), null, 2)}\n`
}
