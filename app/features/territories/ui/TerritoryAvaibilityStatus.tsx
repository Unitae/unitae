import type { Attribution } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { Badge } from '~/shared/ui/badge'

export function TerritoryAvaibilityStatus({ attribution }: { attribution?: Attribution }) {
  const isAvailable = checkAvailabilityStatus(attribution)

  if (!isAvailable) {
    return (
      <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
        en repos
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="border-blue-500 text-blue-500">
      disponible
    </Badge>
  )
}

export function checkAvailabilityStatus(attribution?: Attribution) {
  if (attribution == null) {
    return true
  }

  if (attribution.endDate == null) {
    return false
  }

  const restDays = attribution.type === TerritoryAttributionKind.Default ? 90 : 15
  const restPeriod = restDays * 24 * 3600 * 1000
  const endRestPeriod = new Date()

  endRestPeriod.setTime(attribution.endDate.getTime() + restPeriod)

  return endRestPeriod < new Date()
}
