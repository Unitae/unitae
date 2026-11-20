// Compares two dumps of scripts/events-snapshot.ts. Pure, so that it is tested on its own.

export interface SnapshotDifference {
  /** Where the two dumps part, as a JSON path (`$.12.board.3.events.0.name`: congregation 12, its board document 3…). */
  path: string
  before: unknown
  after: unknown
}

/**
 * Every place where `after` differs from `before`. Keys in `ignoredKeys` are left out on both sides wherever they
 * appear: a column the expand step adds shows up in raw rows without changing what anyone reads.
 */
export function diffSnapshots(
  before: unknown,
  after: unknown,
  ignoredKeys: ReadonlySet<string> = new Set(),
  path = '$',
): SnapshotDifference[] {
  if (Object.is(before, after)) return []
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length)
    return Array.from({ length }, (_, index) =>
      diffSnapshots(before[index], after[index], ignoredKeys, `${path}.${index}`),
    ).flat()
  }
  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    return [...keys]
      .filter(key => !ignoredKeys.has(key))
      .sort()
      .flatMap(key => diffSnapshots(before[key], after[key], ignoredKeys, `${path}.${key}`))
  }
  return [{ path, before, after }]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
