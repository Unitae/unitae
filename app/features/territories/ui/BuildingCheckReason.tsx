import type { Building, BuildingEntrance } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import * as m from '~/paraglide/messages'
import { Badge } from '~/shared/ui/badge'

type BuildingWithEntrances = Building & { entrances: BuildingEntrance[] }

function getResidentialEntrance(building: BuildingWithEntrances): BuildingEntrance | undefined {
  return building.entrances.find(e => e.kind === EntranceKind.Residential)
}

export function BuildingCheckReason({
  building,
  options,
}: {
  building: BuildingWithEntrances
  options: { staleDate: Date }
}) {
  if (checkIncoherentAccessWithHomes(building)) {
    return (
      <Badge variant="secondary" className="max-w-fit text-xs">
        {m.prospection_check_reason_access_homes()}
      </Badge>
    )
  }

  if (checkIncoherentAccessWithPhones(building)) {
    return (
      <Badge variant="secondary" className="max-w-fit text-xs">
        {m.prospection_check_reason_access_phones()}
      </Badge>
    )
  }

  if (checkMissingAccess(building)) {
    return (
      <Badge variant="secondary" className="max-w-fit text-xs">
        {m.prospection_check_reason_missing_access()}
      </Badge>
    )
  }

  if (checkOldData(building, options)) {
    return (
      <Badge variant="secondary" className="max-w-fit text-xs">
        {m.prospection_check_reason_old_data()}
      </Badge>
    )
  }

  if (checkOldData(building, options) && building.active === false) {
    return (
      <Badge variant="secondary" className="max-w-fit text-xs">
        {m.prospection_check_reason_should_reactivate()}
      </Badge>
    )
  }

  if (checkNotInTerritory(building)) {
    return (
      <Badge variant="secondary" className="max-w-fit text-xs">
        {m.prospection_check_reason_not_in_territory()}
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="max-w-fit text-xs">
      {m.prospection_check_reason_nothing()}
    </Badge>
  )
}

function checkOldData(building: BuildingWithEntrances, options: { staleDate: Date }) {
  return building.prospectionDate == null || building.prospectionDate < options.staleDate
}

function checkNotInTerritory(building: BuildingWithEntrances) {
  return building.inTerritory === false && building.active === true
}

function checkMissingAccess(building: BuildingWithEntrances) {
  const entrance = getResidentialEntrance(building)
  return entrance?.access === null && entrance?.homes != null && entrance.homes > 0
}

function checkIncoherentAccessWithPhones(building: BuildingWithEntrances) {
  const entrance = getResidentialEntrance(building)
  return entrance?.access === TerritoryAccess.Code && entrance.isOpenEarly === false && entrance.phones == null
}

function checkIncoherentAccessWithHomes(building: BuildingWithEntrances) {
  const entrance = getResidentialEntrance(building)
  if (entrance?.access === TerritoryAccess.Doorbell && entrance?.homes == null) {
    return true
  }

  if (entrance?.access === TerritoryAccess.Code && entrance.isOpenEarly === true && entrance.homes == null) {
    return true
  }

  return entrance?.access === TerritoryAccess.Intercom && entrance?.homes == null
}
