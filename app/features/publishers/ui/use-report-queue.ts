import { useRef } from 'react'

import type { ReportQueue } from './ReportPanel'

interface Options<T extends { id: number }> {
  /** The rows in the order the page shows them. */
  rows: T[]
  /** A row whose report is still to file, and that the reader may file. */
  isMissing: (row: T) => boolean
  /** The row open in the panel. */
  currentId: number | null
  /** The arrows: opens another missing report, asking first if the open one holds changes. */
  onStep: (row: T) => void
  /** After « Enregistrer et suivant »: opens the next missing report without asking. */
  onAdvance: (row: T) => void
  /** Nothing left to file: closes the panel. */
  onEnd: () => void
}

/**
 * Walks the missing reports in the order of the list, for the panel's arrows and « Enregistrer et suivant ». The
 * missing reports that came after the open one are remembered: once it is saved, the list reloads without it, and
 * the walk picks up at the first of them still missing.
 */
export function useReportQueue<T extends { id: number }>({
  rows,
  isMissing,
  currentId,
  onStep,
  onAdvance,
  onEnd,
}: Options<T>): { position: ReportQueue | null; advance: () => void } {
  const missing = rows.filter(isMissing)
  const index = missing.findIndex(row => row.id === currentId)
  const following = useRef<number[]>([])

  if (index >= 0) {
    following.current = [...missing.slice(index + 1), ...missing.slice(0, index)].map(row => row.id)
  }

  const position: ReportQueue | null =
    index < 0
      ? null
      : {
          position: index + 1,
          total: missing.length,
          onPrevious: () => onStep(missing[(index - 1 + missing.length) % missing.length] as T),
          onNext: () => onStep(missing[(index + 1) % missing.length] as T),
        }

  function advance() {
    const stillMissing = new Map(missing.map(row => [row.id, row]))
    const nextId = following.current.find(id => id !== currentId && stillMissing.has(id))
    const next = nextId == null ? undefined : stillMissing.get(nextId)
    if (next) onAdvance(next)
    else onEnd()
  }

  return { position, advance }
}
