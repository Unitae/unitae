import type { Building, BuildingEntrance, Territory } from '~/database/generated/client'

export type DetailedBuilding = Building & {
  entrance: (BuildingEntrance & { buildings: Building[]; territories: Territory[] }) | null
}
