import { AlertTriangle } from 'lucide-react'
import * as m from '~/i18n/paraglide/messages'
import { Alert, AlertDescription, AlertTitle } from '~/shared/ui/alert'

export type GeocodeNoticeKind = 'failed' | 'missing-query'

export interface GeocodeNoticeData {
  kind: GeocodeNoticeKind
  // The user's geocode query, when relevant. Echoed in the `failed` notice.
  query?: string
}

interface GeocodeNoticeProps {
  notice: GeocodeNoticeData | null
}

/**
 * Surfaces the geocoder's failure modes:
 * - `failed` — query was sent but no result (API miss, network error, or no
 *   `GOOGLE_MAPS_API_KEY`). Results revert to text-only.
 * - `missing-query` — the user typed `@` with no place — operator mode is on
 *   but there's nothing to look up yet.
 */
export default function GeocodeNotice({ notice }: GeocodeNoticeProps) {
  if (notice == null) return null

  return (
    <Alert variant="warning">
      <AlertTriangle />
      <AlertTitle>{m.territories_filter_geocode_failed_title()}</AlertTitle>
      <AlertDescription>
        {notice.kind === 'failed' && m.territories_filter_geocode_failed({ query: notice.query ?? '' })}
        {notice.kind === 'missing-query' && m.territories_filter_proximity_query_missing()}
      </AlertDescription>
    </Alert>
  )
}
