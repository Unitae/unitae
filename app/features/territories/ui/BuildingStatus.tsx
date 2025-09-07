import type { Building } from '~/database/generated/client'

export function BuildingStatus({ building, options }: { building: Building; options: { staleDate: Date } }) {
  if (!building.inTerritory) {
    return (
      <span className="inline-block rounded-2xl border border-gray-500 bg-gray-500/25 px-3 text-gray-500 max-sm:h-3 max-sm:w-3 max-sm:px-0">
        <span className="max-sm:hidden">hors territoire</span>
      </span>
    )
  }

  if (!building.active) {
    return (
      <span className="inline-block rounded-2xl border border-gray-500 bg-gray-500/25 px-3 text-gray-500 max-sm:h-3 max-sm:w-3 max-sm:px-0">
        <span className="max-sm:hidden">inactif</span>
      </span>
    )
  }

  if (building.prospectionDate == null || building.prospectionDate < options.staleDate) {
    return (
      <span className="inline-block rounded-2xl border border-orange-500 bg-orange-500/25 px-3 text-orange-500 max-sm:h-3 max-sm:w-3 max-sm:px-0">
        <span className="max-sm:hidden">à prospecter</span>
      </span>
    )
  }
  return (
    <span className="inline-block rounded-2xl border border-green-500 bg-green-500/25 px-3 text-green-500 max-sm:h-3 max-sm:w-3 max-sm:px-0">
      <span className="max-sm:hidden">actif</span>
    </span>
  )
}
