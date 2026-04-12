import type { Building, BuildingAccess, BuildingEntrance, BuildingResidentialData } from '~/database/generated/client'

export type Entrance = BuildingEntrance & {
  buildings: Building[]
  accesses?: BuildingAccess[]
  residentialData?: BuildingResidentialData[]
}
export type AggregatedEntrance = Entrance & {
  street: string
  zip: string
  number: string
  homes: number
  phones: number
  liberals: number
  importantNotes: string[]
}
