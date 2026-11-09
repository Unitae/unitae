import { useEffect, useRef } from 'react'
import type { useFetcher } from 'react-router'

/** Calls `onSaved` once the fetcher's submission comes back `{ ok: true }`: the editor that sent it can close. */
export function useCloseOnSave(fetcher: ReturnType<typeof useFetcher>, onSaved: () => void) {
  const previous = useRef(fetcher.state)
  const latest = useRef(onSaved)
  latest.current = onSaved

  useEffect(() => {
    const ok = (fetcher.data as { ok?: boolean } | undefined)?.ok
    if (previous.current === 'submitting' && fetcher.state !== 'submitting' && ok) latest.current()
    previous.current = fetcher.state
  }, [fetcher.state, fetcher.data])
}
