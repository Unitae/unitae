import type { Building, BuildingEntrance } from '~/database/generated/client'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'

export function BuildingCheckReason({
  building,
  options,
}: {
  building: Building & { entrance: BuildingEntrance | null }
  options: { staleDate: Date }
}) {
  if (checkIncoherentAccessWithHomes(building)) {
    return <p className="max-w-fit text-sm max-sm:text-xs">Possible d'entrer mais nombre de logements indisponible</p>
  }

  if (checkIncoherentAccessWithPhones(building)) {
    return (
      <p className="max-w-fit text-sm max-sm:text-xs">Impossible d'entrer mais nombre de téléphones indisponible</p>
    )
  }

  if (checkMissingAccess(building)) {
    return <p className="max-w-fit text-sm max-sm:text-xs">Nombre de logement indiqué mais pas le mode d'accés</p>
  }

  if (checkOldData(building, options)) {
    return <p className="max-w-fit text-sm max-sm:text-xs">Données de prospection trop vielles</p>
  }

  if (checkOldData(building, options) && building.active === false) {
    return <p className="max-w-fit text-sm max-sm:text-xs">Le batiment ne devrait peut-être plus être inactif</p>
  }

  if (checkNotInTerritory(building)) {
    return <p className="max-w-fit text-sm max-sm:text-xs">Ce batiment n'est pas dans le territoire mais actif</p>
  }

  return <p className="max-w-fit text-sm max-sm:text-xs">Rien à vérifier</p>
}

function checkOldData(building: Building & { entrance: BuildingEntrance | null }, options: { staleDate: Date }) {
  return building.prospectionDate == null || building.prospectionDate < options.staleDate
}

function checkNotInTerritory(building: Building & { entrance: BuildingEntrance | null }) {
  return building.inTerritory === false && building.active === true
}

function checkMissingAccess(building: Building & { entrance: BuildingEntrance | null }) {
  return building.entrance?.access === null && building.homes != null && building.homes > 0
}

function checkIncoherentAccessWithPhones(building: Building & { entrance: BuildingEntrance | null }) {
  return (
    building.entrance?.access === TerritoryAccess.Code &&
    building.entrance.isOpenEarly === false &&
    building.phones == null
  )
}

function checkIncoherentAccessWithHomes(building: Building & { entrance: BuildingEntrance | null }) {
  if (building.entrance?.access === TerritoryAccess.Doorbell && building.homes == null) {
    return true
  }

  if (
    building.entrance?.access === TerritoryAccess.Code &&
    building.entrance.isOpenEarly === true &&
    building.homes == null
  ) {
    return true
  }

  return building.entrance?.access === TerritoryAccess.Intercom && building.homes == null
}
