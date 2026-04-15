import type { Building } from '~/database/generated/client'
import * as m from '~/paraglide/messages'
import { Badge } from '~/shared/ui/badge'

export function BuildingStatus({ building, options }: { building: Building; options: { staleDate: Date } }) {
  if (!building.inTerritory) {
    return (
      <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
        {m.prospection_building_status_outside()}
      </Badge>
    )
  }

  if (!building.active) {
    return (
      <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
        {m.prospection_building_status_inactive()}
      </Badge>
    )
  }

  if (building.prospectionDate == null || building.prospectionDate < options.staleDate) {
    return (
      <Badge variant="outline" className="border-orange-500 text-orange-500">
        {m.prospection_building_status_needs_prospection()}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-green-500 text-green-500">
      {m.prospection_building_status_active()}
    </Badge>
  )
}
