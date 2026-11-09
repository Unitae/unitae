const DAY_MS = 24 * 60 * 60 * 1000

// How far through its loan period an attribution is, 0–100, rounded to whole days.
export function elapsedPercent(start: Date | string, due: Date | string, now: Date = new Date()): number {
  const total = Math.round((new Date(due).getTime() - new Date(start).getTime()) / DAY_MS)
  if (total <= 0) return 100
  const elapsed = Math.round((now.getTime() - new Date(start).getTime()) / DAY_MS)
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))
}
