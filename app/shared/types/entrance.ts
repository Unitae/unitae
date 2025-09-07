import type { Building, BuildingEntrance } from '~/database/generated/client'

export type Entrance = BuildingEntrance & { buildings: Building[] }
export type AggregatedEntrance = Entrance & {
  street: string
  zip: string
  number: string
  homes: number
  phones: number
  liberals: number
  importantNotes: string[]
}
