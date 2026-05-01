import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'
import { entranceContentLabel } from '~/features/territories/server/entrance-content-label'
import * as m from '~/paraglide/messages'
import { Button } from '~/shared/ui/button'

export type EntrancePendingState =
  | 'none'
  | 'pending-add'
  | 'pending-remove'
  | 'pending-reassign'

type Props = {
  entrance: BboxEntrance
  territoryType: TerritoryKind
  pending: EntrancePendingState
  onAct: () => void
}

function statusLine(entrance: BboxEntrance, pending: EntrancePendingState) {
  if (pending === 'pending-add') {
    return m.territories_map_status_in_territory()
  }
  if (entrance.status === 'in-this-territory' && pending !== 'pending-remove') {
    return m.territories_map_status_in_territory()
  }
  if (entrance.status === 'available') {
    return m.territories_map_status_available()
  }
  if (entrance.otherTerritory != null) {
    return m.territories_map_status_on_other_territory({ number: entrance.otherTerritory.number })
  }
  return m.territories_map_status_available()
}

function actionLabel(entrance: BboxEntrance, pending: EntrancePendingState) {
  if (pending !== 'none') return m.territories_map_action_undo()
  if (entrance.status === 'in-this-territory') return m.territories_map_action_remove()
  if (entrance.status === 'available') return m.territories_map_action_add()
  return m.territories_map_action_reassign()
}

function actionVariant(entrance: BboxEntrance, pending: EntrancePendingState) {
  if (pending !== 'none') return 'outline' as const
  if (entrance.status === 'in-this-territory') return 'destructive' as const
  if (entrance.status === 'on-other-territory') return 'destructive' as const
  return 'default' as const
}

export default function EntrancePopup({ entrance, territoryType, pending, onAct }: Props) {
  return (
    <div className="flex min-w-[220px] flex-col gap-2">
      <p className="font-medium">
        {entrance.address.number} {entrance.address.street}, {entrance.address.zip}
      </p>
      <p className="text-muted-foreground text-sm">{entranceContentLabel(territoryType, entrance)}</p>
      <p className="text-sm">{statusLine(entrance, pending)}</p>
      <Button type="button" size="sm" variant={actionVariant(entrance, pending)} onClick={onAct}>
        {actionLabel(entrance, pending)}
      </Button>
    </div>
  )
}
