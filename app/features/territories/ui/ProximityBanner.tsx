import { MapPin, X } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router'
import type { GeocodeResult } from '~/shared/infra/geocoder.server'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'

interface ProximityBannerProps {
  geocode: GeocodeResult
}

/**
 * Confirms what address the geocoder resolved, lets the user dismiss it, and
 * surfaces up to two alternates as "Did you mean?" chips that re-submit the
 * search forced as a proximity query.
 */
export default function ProximityBanner({ geocode }: ProximityBannerProps) {
  const [params] = useSearchParams()
  const location = useLocation()

  const clearParams = new URLSearchParams(params)
  clearParams.delete('search')
  clearParams.delete('page')
  clearParams.delete('sort')
  const clearTo = `${location.pathname}${clearParams.toString() ? `?${clearParams}` : ''}`

  function alternateTo(formatted: string) {
    const next = new URLSearchParams(params)
    next.set('search', `@${formatted}`)
    next.delete('page')
    return `${location.pathname}?${next.toString()}`
  }

  return (
    <section
      aria-label={m.territories_filter_proximity_banner()}
      className="rounded-lg border bg-muted/40 px-4 py-3 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-muted-foreground">{m.territories_filter_proximity_banner()}</span>
        <span className="font-medium">{geocode.formatted}</span>
        <Link
          to={clearTo}
          className="ml-auto inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
          aria-label={m.territories_filter_proximity_change()}
        >
          <X className="size-3" />
          {m.territories_filter_proximity_change()}
        </Link>
      </div>
      {geocode.alternates.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">{m.territories_filter_proximity_did_you_mean()}</span>
          {geocode.alternates.map(alternate => (
            <Badge key={alternate.placeId} variant="outline" asChild className="text-xs">
              <Link to={alternateTo(alternate.formatted)}>{alternate.formatted}</Link>
            </Badge>
          ))}
        </div>
      )}
    </section>
  )
}
