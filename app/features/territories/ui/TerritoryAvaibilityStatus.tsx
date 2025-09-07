import type { Attribution } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'

export function TerritoryAvaibilityStatus({ attribution }: { attribution?: Attribution }) {
  const isAvailable = checkAvailabilityStatus(attribution)

  if (!isAvailable) {
    return (
      <span className="inline-block rounded-2xl border border-gray-500 bg-gray-500/25 px-3 text-gray-500 max-sm:h-3 max-sm:w-3 max-sm:px-0">
        <span className="max-sm:hidden">en repos</span>
      </span>
    )
  }

  return (
    <span className="inline-block rounded-2xl border border-blue-500 bg-blue-500/25 px-3 text-blue-500 max-sm:h-3 max-sm:w-3 max-sm:px-0">
      <span className="max-sm:hidden">disponible</span>
    </span>
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
