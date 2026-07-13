import { Trash2 } from 'lucide-react'
import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'
import { entranceContentLabel } from '~/features/territories/server/entrance-content-label'
import * as m from '~/i18n/paraglide/messages'
import type { AggregatedEntrance } from '~/shared/types/entrance'
import { Button } from '~/shared/ui/button'

type EntrancesWithoutCoordinatesListProps = {
  entrances: AggregatedEntrance[]
  territoryType: TerritoryKind
  pendingRemovals: Map<number, BboxEntrance | AggregatedEntrance>
  onRemove: (entrance: AggregatedEntrance) => void
  onRevert: (entranceId: number) => void
}

export function EntrancesWithoutCoordinatesList({
  entrances,
  territoryType,
  pendingRemovals,
  onRemove,
  onRevert,
}: EntrancesWithoutCoordinatesListProps) {
  return (
    <details className="rounded-md border bg-muted/30 p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        {m.territories_edit_no_coords_heading({
          count: String(entrances.length),
        })}
      </summary>
      <p className="mt-2 text-muted-foreground text-xs">{m.territories_edit_no_coords_body()}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {entrances.map(entrance => (
          <li key={entrance.id} className="flex items-center justify-between gap-2 rounded border p-2">
            <span className="flex flex-col">
              <span className="font-medium">
                {entrance.number} {entrance.street}, {entrance.zip}
              </span>
              <span className="text-muted-foreground text-xs">{entranceContentLabel(territoryType, entrance)}</span>
            </span>
            {!pendingRemovals.has(entrance.id) ? (
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onRemove(entrance)}
                title={m.territories_form_remove_building_title()}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => onRevert(entrance.id)}
                title={m.territories_map_pending_revert_title()}
              >
                {m.territories_map_action_undo()}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
