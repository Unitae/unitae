import type {
  Building,
  BuildingAccess,
  BuildingEntrance,
  BuildingResidentialData,
  Territory,
} from '~/database/generated/client'

export type DetailedBuildingEntrance = BuildingEntrance & {
  buildings: Building[]
  territories: Territory[]
  accesses: BuildingAccess[]
  residentialData: BuildingResidentialData[]
}

export type DetailedBuilding = Building & {
  entrances: DetailedBuildingEntrance[]
  residentialData: BuildingResidentialData | null
}
