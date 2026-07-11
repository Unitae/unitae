import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'
import { entranceContentLabel } from '~/features/territories/server/entrance-content-label'
import type { TerritoryContent } from '~/features/territories/server/territory-content.queries'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

const territoryContentSchema = z.object({
  id: z.number(),
  number: z.string(),
  kind: z.enum([
    TerritoryKind.Classical,
    TerritoryKind.Phone,
    TerritoryKind.Commerces,
    TerritoryKind.Hotel,
    TerritoryKind.Univ,
  ]),
  entranceCount: z.number().nonnegative(),
  quantity: z.number().nonnegative(),
  homes: z.number().nonnegative(),
  phones: z.number().nonnegative(),
  liberals: z.number().nonnegative(),
}) satisfies z.ZodType<TerritoryContent>

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

export type ForeignContentErrorReason = 'not-found' | 'server' | 'network' | 'unexpected'

export type ForeignContentState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; content: TerritoryContent }
  | { status: 'error'; reason: ForeignContentErrorReason }

function reasonForResponse(status: number): ForeignContentErrorReason {
  if (status === 404) return 'not-found'
  if (status >= 500) return 'server'
  return 'unexpected'
}

// Fetches the current content of a foreign territory so the manager can gauge
// the impact of moving an entrance away from it. One request per popup lifetime;
// checks signal.aborted (not err.name) so custom-reason aborts don't leak into
// the error state.
export function useForeignTerritoryContent(territoryId: number | null): ForeignContentState {
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
        if (!response.ok) {
          setState({ status: 'error', reason: reasonForResponse(response.status) })
          return
        }
        const body = (await response.json()) as unknown
        const parsed = territoryContentSchema.safeParse(body)
        if (!parsed.success) {
          setState({ status: 'error', reason: 'unexpected' })
          return
        }
        setState({ status: 'ready', content: parsed.data })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setState({ status: 'error', reason: 'network' })
      })

    return () => controller.abort()
  }, [territoryId])

  return state
}

function errorLine(reason: ForeignContentErrorReason): string {
  if (reason === 'not-found') return m.territories_map_popup_impact_not_found()
  return m.territories_map_popup_impact_error()
}

type ImpactSummary = { current: string; afterRemoval: string }

function summariseImpact(content: TerritoryContent, entrance: BboxEntrance): ImpactSummary {
  if (content.kind === TerritoryKind.Phone) {
    const after = Math.max(0, content.phones - entrance.phones)
    return {
      current: m.territories_map_popup_impact_phones({ count: content.phones }),
      afterRemoval: m.territories_map_popup_impact_after_removal_phones({ count: after }),
    }
  }
  if (content.kind === TerritoryKind.Classical || content.kind === TerritoryKind.Univ) {
    // Mirror computeTerritoryQuantity — Classical/Univ aggregate as `homes || phones` per entrance.
    const contribution = entrance.homes || entrance.phones
    const after = Math.max(0, content.quantity - contribution)
    return {
      current: m.territories_map_popup_impact_homes({ count: content.quantity }),
      afterRemoval: m.territories_map_popup_impact_after_removal_homes({ count: after }),
    }
  }
  const after = Math.max(0, content.entranceCount - 1)
  return {
    current: m.territories_map_popup_impact_addresses({ count: content.entranceCount }),
    afterRemoval: m.territories_map_popup_impact_after_removal_addresses({ count: after }),
  }
}

function ImpactBlock({ entrance, territoryNumber }: { entrance: BboxEntrance; territoryNumber: string }) {
  const state = useForeignTerritoryContent(entrance.otherTerritory?.id ?? null)
  return (
    <div className="mt-1 rounded-md border bg-muted/40 p-2">
      <p className="font-medium text-xs">{m.territories_map_popup_impact_title({ number: territoryNumber })}</p>
      {state.status === 'loading' || state.status === 'idle' ? (
        <p className="mt-1 text-muted-foreground text-xs italic">{m.territories_map_popup_impact_loading()}</p>
      ) : null}
      {state.status === 'error' ? <p className="mt-1 text-destructive text-xs">{errorLine(state.reason)}</p> : null}
      {state.status === 'ready' ? (
        <>
          <p className="mt-1 text-muted-foreground text-xs">{summariseImpact(state.content, entrance).current}</p>
          <p className="text-muted-foreground text-xs italic">
            {summariseImpact(state.content, entrance).afterRemoval}
          </p>
        </>
      ) : null}
    </div>
  )
}

function accessBadges(entrance: BboxEntrance): string[] {
  if (entrance.kind !== EntranceKind.Residential) return []
  const parts: string[] = []
  const hasCode =
    entrance.access === TerritoryAccess.Code || entrance.accesses.some(a => a.type === TerritoryAccess.Code)
  const hasIntercom =
    entrance.access === TerritoryAccess.Intercom || entrance.accesses.some(a => a.type === TerritoryAccess.Intercom)
  const hasDoorbell =
    entrance.access === TerritoryAccess.Doorbell || entrance.accesses.some(a => a.type === TerritoryAccess.Doorbell)
  if (hasIntercom) parts.push(m.territories_map_popup_access_intercom())
  if (hasCode) parts.push(m.territories_map_popup_access_digicode())
  if (hasDoorbell) parts.push(m.territories_map_popup_access_doorbell())
  if (hasCode && entrance.isOpenEarly) parts.push(m.territories_map_popup_access_open_early())
  if (hasCode && entrance.isMailboxOpen) parts.push(m.territories_map_popup_access_mailbox_open())
  if (entrance.isPMR) parts.push(m.territories_map_popup_access_pmr())
  return parts
}

function formatProspectionDate(iso: string | null): string | null {
  if (iso == null) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
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

  const badges = accessBadges(entrance)
  const prospectedOn = formatProspectionDate(entrance.prospectionDate)

  return (
    <div className="flex min-w-[280px] max-w-[340px] flex-col gap-1.5 m-3">
      <div className={`-mx-3 -mt-3 mb-1 h-1 rounded-t-lg ${accentClassFor(entrance, pending)}`} aria-hidden="true" />
      <p className="font-semibold text-base">
        {entrance.address.number} {entrance.address.street}, {entrance.address.zip}
      </p>
      <p className="text-muted-foreground text-xs">{entranceContentLabel(territoryType, entrance)}</p>
      {badges.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {badges.map(badge => (
            <span
              key={badge}
              className="inline-flex items-center rounded-full border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {badge}
            </span>
          ))}
        </div>
      ) : null}
      {prospectedOn != null ? (
        <p className="text-muted-foreground text-xs italic">
          {m.territories_map_popup_last_prospection({ date: prospectedOn })}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">{statusLine(entrance, pending)}</p>
      {showImpactBlock && entrance.otherTerritory != null ? (
        <ImpactBlock entrance={entrance} territoryNumber={entrance.otherTerritory.number} />
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
