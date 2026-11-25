import { useEffect, useRef } from 'react'
import type { useFetcher } from 'react-router'

/**
 * Runs once a fetcher's submission has settled with `{ ok: true }`: answered and its reload done. It watches the
 * answer, not the states on the way: React may never render `submitting` (or `loading`) when the answer is quick, so
 * a rule on those states misses a save now and then. An answer already there on mount is not a new one.
 */
export function useOnSettled(fetcher: Pick<ReturnType<typeof useFetcher>, 'state' | 'data'>, onSettled: () => void) {
  const seen = useRef(fetcher.data)
  const latest = useRef(onSettled)
  latest.current = onSettled
  useEffect(() => {
    if (fetcher.state !== 'idle' || fetcher.data === seen.current) return
    seen.current = fetcher.data
    if ((fetcher.data as { ok?: boolean } | undefined)?.ok) latest.current()
  }, [fetcher.state, fetcher.data])
}
