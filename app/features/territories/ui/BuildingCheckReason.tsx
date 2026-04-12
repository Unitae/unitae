import type { Building, BuildingEntrance } from '~/database/generated/client'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { Badge } from '~/shared/ui/badge'

type BuildingWithEntrances = Building & { entrances: BuildingEntrance[] }

function getResidentialEntrance(building: BuildingWithEntrances): BuildingEntrance | undefined {
  return building.entrances.find(e => e.kind === 'residential')
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
        Possible d'entrer mais nombre de logements indisponible
      </Badge>
    )
  }

  if (checkIncoherentAccessWithPhones(building)) {
    return (
      <Badge variant="secondary" className="max-w-fit text-xs">
        Impossible d'entrer mais nombre de téléphones indisponible
      </Badge>
    )
  }

  if (checkMissingAccess(building)) {
    return (
      <Badge variant="secondary" className="max-w-fit text-xs">
        Nombre de logement indiqué mais pas le mode d'accés
      </Badge>
    )
  }

  if (checkOldData(building, options)) {
    return (
      <Badge variant="secondary" className="max-w-fit text-xs">
        Données de prospection trop vielles
      </Badge>
    )
  }

  if (checkOldData(building, options) && building.active === false) {
    return (
      <Badge variant="secondary" className="max-w-fit text-xs">
        Le batiment ne devrait peut-être plus être inactif
      </Badge>
    )
  }

  if (checkNotInTerritory(building)) {
    return (
      <Badge variant="secondary" className="max-w-fit text-xs">
        Ce batiment n'est pas dans le territoire mais actif
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="max-w-fit text-xs">
      Rien à vérifier
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
