import { useState } from 'react'
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
    return m.territories_map_status_pending_add()
  }
  if (pending === 'pending-remove') {
    return m.territories_map_status_pending_remove()
  }
  if (pending === 'pending-reassign' && entrance.otherTerritory != null) {
    return m.territories_map_status_pending_reassign({ number: entrance.otherTerritory.number })
  }
  if (entrance.status === 'in-this-territory') {
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
  if (entrance.otherTerritory != null) {
    return m.territories_map_action_reassign_with_source({ number: entrance.otherTerritory.number })
  }
  return m.territories_map_action_reassign()
}

function actionVariant(entrance: BboxEntrance, pending: EntrancePendingState) {
  if (pending !== 'none') return 'outline' as const
  if (entrance.status === 'in-this-territory') return 'destructive' as const
  if (entrance.status === 'on-other-territory') return 'destructive' as const
  return 'default' as const
}

function accentClassFor(entrance: BboxEntrance, pending: EntrancePendingState): string {
  if (pending === 'pending-remove') return 'bg-destructive'
  if (pending === 'pending-add' || pending === 'pending-reassign') return 'bg-blue-600'
  if (entrance.status === 'in-this-territory') return 'bg-blue-600'
  if (entrance.status === 'available') return 'bg-emerald-500'
  return 'bg-slate-300'
}

export default function EntrancePopup({ entrance, territoryType, pending, onAct }: Props) {
  const [confirmingReassign, setConfirmingReassign] = useState(false)
  const isReassignFlow =
    pending === 'none' && entrance.status === 'on-other-territory' && entrance.otherTerritory != null

  if (confirmingReassign && entrance.otherTerritory != null) {
    return (
      <div className="flex min-w-[240px] max-w-[280px] flex-col gap-2">
        <div className={`-mx-3 -mt-3 mb-1 h-1 rounded-t ${accentClassFor(entrance, pending)}`} aria-hidden="true" />
        <p className="font-semibold text-base">{m.territories_map_reassign_confirm_title()}</p>
        <p className="text-muted-foreground text-xs">
          {m.territories_map_reassign_confirm_body({ number: entrance.otherTerritory.number })}
        </p>
        <div className="-mx-3 -mb-3 mt-1 flex gap-2 border-t px-3 py-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setConfirmingReassign(false)}
            className="flex-1"
          >
            {m.territories_map_reassign_confirm_cancel()}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => {
              setConfirmingReassign(false)
              onAct()
            }}
            className="flex-1"
          >
            {m.territories_map_reassign_confirm_submit()}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-w-[240px] max-w-[280px] flex-col gap-1.5">
      <div className={`-mx-3 -mt-3 mb-1 h-1 rounded-t ${accentClassFor(entrance, pending)}`} aria-hidden="true" />
      <p className="font-semibold text-base">
        {entrance.address.number} {entrance.address.street}, {entrance.address.zip}
      </p>
      <p className="text-muted-foreground text-xs">{entranceContentLabel(territoryType, entrance)}</p>
      <p className="text-muted-foreground text-xs">{statusLine(entrance, pending)}</p>
      <div className="-mx-3 -mb-3 mt-1 border-t px-3 py-2">
        <Button
          type="button"
          size="sm"
          variant={actionVariant(entrance, pending)}
          onClick={() => {
            if (isReassignFlow) {
              setConfirmingReassign(true)
            } else {
              onAct()
            }
          }}
          className="w-full"
        >
          {actionLabel(entrance, pending)}
        </Button>
      </div>
    </div>
  )
}
