import { useEffect, useState } from 'react'
import { z } from 'zod'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { TerritoryContent } from '~/features/territories/server/territory-content.queries'

const territoryContentSchema = z.object({
  id: z.number(),
  number: z.string(),
  kind: z.enum([
    TerritoryKind.Classical,
    TerritoryKind.Phone,
    TerritoryKind.Commerces,
    TerritoryKind.Hotel,
    TerritoryKind.Univ,
  ]),
  entranceCount: z.number().nonnegative(),
  quantity: z.number().nonnegative(),
  homes: z.number().nonnegative(),
  phones: z.number().nonnegative(),
  liberals: z.number().nonnegative(),
}) satisfies z.ZodType<TerritoryContent>

export type ForeignContentErrorReason = 'not-found' | 'server' | 'network' | 'unexpected'

export type ForeignContentState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; content: TerritoryContent }
  | { status: 'error'; reason: ForeignContentErrorReason }

function reasonForResponse(status: number): ForeignContentErrorReason {
  if (status === 404) return 'not-found'
  if (status >= 500) return 'server'
  return 'unexpected'
}

// Fetches the current content of a foreign territory so the manager can gauge
// the impact of moving an entrance away from it. One request per popup lifetime;
// checks signal.aborted (not err.name) so custom-reason aborts don't leak into
// the error state.
export function useForeignTerritoryContent(territoryId: number | null): ForeignContentState {
  const [state, setState] = useState<ForeignContentState>({ status: 'idle' })

  useEffect(() => {
    if (territoryId == null) {
      setState({ status: 'idle' })
      return
    }
    const controller = new AbortController()
    setState({ status: 'loading' })

    fetch(`/territories/api/territory/${territoryId}/content`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async response => {
        if (!response.ok) {
          setState({ status: 'error', reason: reasonForResponse(response.status) })
          return
        }
        const body = (await response.json()) as unknown
        const parsed = territoryContentSchema.safeParse(body)
        if (!parsed.success) {
          setState({ status: 'error', reason: 'unexpected' })
          return
        }
        setState({ status: 'ready', content: parsed.data })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setState({ status: 'error', reason: 'network' })
      })

    return () => controller.abort()
  }, [territoryId])

  return state
}
