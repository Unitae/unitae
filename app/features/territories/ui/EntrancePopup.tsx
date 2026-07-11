import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'
import { entranceContentLabel } from '~/features/territories/server/entrance-content-label'
import type { TerritoryContent } from '~/features/territories/server/territory-content.queries'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

export type EntrancePendingState = 'none' | 'pending-add' | 'pending-remove' | 'pending-reassign'

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
    return m.territories_map_status_pending_reassign({
      number: entrance.otherTerritory.number,
    })
  }
  if (entrance.status === 'in-this-territory') {
    return m.territories_map_status_in_territory()
  }
  if (entrance.status === 'available') {
    return m.territories_map_status_available()
  }
  if (entrance.otherTerritory != null) {
    return m.territories_map_status_on_other_territory({
      number: entrance.otherTerritory.number,
    })
  }
  return m.territories_map_status_available()
}

function actionLabel(entrance: BboxEntrance, pending: EntrancePendingState) {
  if (pending !== 'none') return m.territories_map_action_undo()
  if (entrance.status === 'in-this-territory') return m.territories_map_action_remove()
  if (entrance.status === 'available') return m.territories_map_action_add()
  if (entrance.otherTerritory != null) {
    return m.territories_map_action_reassign_with_source({
      number: entrance.otherTerritory.number,
    })
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

type ForeignContentState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; content: TerritoryContent }
  | { status: 'error' }

// Fetches the current content of a foreign territory so the manager can gauge
// the impact of moving an entrance away from it. One request per popup lifetime;
// aborted on unmount to avoid setState on an unmounted component.
function useForeignTerritoryContent(territoryId: number | null): ForeignContentState {
  const [state, setState] = useState<ForeignContentState>({ status: 'idle' })

  useEffect(() => {
    if (territoryId == null) {
      setState({ status: 'idle' })
      return
    }
    const controller = new AbortController()
    setState({ status: 'loading' })

    fetch(`/territories/api/territory/${territoryId}/content`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async response => {
        if (!response.ok) throw new Error(`status ${response.status}`)
        const content = (await response.json()) as TerritoryContent
        setState({ status: 'ready', content })
      })
      .catch(err => {
        if ((err as { name?: string }).name === 'AbortError') return
        setState({ status: 'error' })
      })

    return () => controller.abort()
  }, [territoryId])

  return state
}

function contentSummaryLine(content: TerritoryContent): string {
  if (content.kind === TerritoryKind.Phone) {
    return m.territories_map_popup_impact_phones({ count: content.phones })
  }
  if (content.kind === TerritoryKind.Classical || content.kind === TerritoryKind.Univ) {
    return m.territories_map_popup_impact_homes({ count: content.quantity })
  }
  return m.territories_map_popup_impact_addresses({ count: content.entranceCount })
}

function ImpactBlock({ territoryId, territoryNumber }: { territoryId: number; territoryNumber: string }) {
  const state = useForeignTerritoryContent(territoryId)
  return (
    <div className="mt-1 rounded-md border bg-muted/40 p-2">
      <p className="font-medium text-xs">{m.territories_map_popup_impact_title({ number: territoryNumber })}</p>
      {state.status === 'loading' || state.status === 'idle' ? (
        <p className="mt-1 text-muted-foreground text-xs italic">{m.territories_map_popup_impact_loading()}</p>
      ) : null}
      {state.status === 'error' ? (
        <p className="mt-1 text-destructive text-xs">{m.territories_map_popup_impact_error()}</p>
      ) : null}
      {state.status === 'ready' ? (
        <p className="mt-1 text-muted-foreground text-xs">{contentSummaryLine(state.content)}</p>
      ) : null}
    </div>
  )
}

function NavigationLinks({ entrance }: { entrance: BboxEntrance }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
      <a
        href={`/territories/building/${entrance.buildingId}/view`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-primary hover:underline"
      >
        <ExternalLink className="size-3" aria-hidden="true" />
        {m.territories_map_popup_view_building()}
      </a>
      {entrance.otherTerritory != null ? (
        <a
          href={`/territories/territory/${entrance.otherTerritory.id}/view`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <ExternalLink className="size-3" aria-hidden="true" />
          {m.territories_map_popup_view_other_territory({ number: entrance.otherTerritory.number })}
        </a>
      ) : null}
    </div>
  )
}

export default function EntrancePopup({ entrance, territoryType, pending, onAct }: Props) {
  const [confirmingReassign, setConfirmingReassign] = useState(false)
  const isReassignFlow =
    pending === 'none' && entrance.status === 'on-other-territory' && entrance.otherTerritory != null
  const showImpactBlock = entrance.status === 'on-other-territory' && entrance.otherTerritory != null

  if (confirmingReassign && entrance.otherTerritory != null) {
    return (
      <div className="flex min-w-[280px] max-w-[340px] flex-col gap-2 m-[12px]">
        <div className={`-mx-3 -mt-3 mb-1 h-1 rounded-t ${accentClassFor(entrance, pending)}`} aria-hidden="true" />
        <p className="font-semibold text-base">{m.territories_map_reassign_confirm_title()}</p>
        <p className="text-muted-foreground text-xs">
          {m.territories_map_reassign_confirm_body({
            number: entrance.otherTerritory.number,
          })}
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
    <div className="flex min-w-[280px] max-w-[340px] flex-col gap-1.5 m-3">
      <div className={`-mx-3 -mt-3 mb-1 h-1 rounded-t-lg ${accentClassFor(entrance, pending)}`} aria-hidden="true" />
      <p className="font-semibold text-base">
        {entrance.address.number} {entrance.address.street}, {entrance.address.zip}
      </p>
      <p className="text-muted-foreground text-xs">{entranceContentLabel(territoryType, entrance)}</p>
      <p className="text-muted-foreground text-xs">{statusLine(entrance, pending)}</p>
      {showImpactBlock && entrance.otherTerritory != null ? (
        <ImpactBlock territoryId={entrance.otherTerritory.id} territoryNumber={entrance.otherTerritory.number} />
      ) : null}
      <NavigationLinks entrance={entrance} />
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
