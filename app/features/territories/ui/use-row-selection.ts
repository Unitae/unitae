import { useEffect, useState } from 'react'

/** The ticked rows of the page, emptied whenever the page shows other rows (another view, page or filter). */
export function useRowSelection(rows: { id: number }[], enabled: boolean) {
  const [ids, setIds] = useState<ReadonlySet<number>>(new Set())
  const key = rows.map(row => row.id).join(',')
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key stands for the rows shown
  useEffect(() => setIds(new Set()), [key, enabled])
  return {
    enabled,
    ids,
    clear: () => setIds(new Set()),
    onToggle: (id: number) =>
      setIds(current => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    onToggleAll: (all: number[]) => setIds(current => (all.every(id => current.has(id)) ? new Set() : new Set(all))),
  }
}
