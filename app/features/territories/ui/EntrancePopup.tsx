import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
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

type BodyProps = {
  entrance: BboxEntrance
  pending: EntrancePendingState
  onAct: () => void
}

// ─── Shared status / accent helpers ───────────────────────────────────────

function pendingStatusText(pending: EntrancePendingState, entrance: BboxEntrance): string | null {
  if (pending === 'pending-add') return m.territories_map_status_pending_add()
  if (pending === 'pending-remove') return m.territories_map_status_pending_remove()
  if (pending === 'pending-reassign' && entrance.otherTerritory != null) {
    return m.territories_map_status_pending_reassign({ number: entrance.otherTerritory.number })
  }
  return null
}

function accentClassFor(entrance: BboxEntrance, pending: EntrancePendingState): string {
  if (pending === 'pending-remove') return 'bg-destructive'
  if (pending === 'pending-add' || pending === 'pending-reassign') return 'bg-blue-600'
  if (entrance.status === 'in-this-territory') return 'bg-blue-600'
  if (entrance.status === 'available') return 'bg-emerald-500'
  return 'bg-slate-300'
}

// ─── Foreign territory content — lazy fetch + typed errors ────────────────

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

// ─── Impact block ─────────────────────────────────────────────────────────

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

function secondaryAggregates(content: TerritoryContent): string[] {
  const isPhonePrimary = content.kind === TerritoryKind.Phone
  const isHomesPrimary = content.kind === TerritoryKind.Classical || content.kind === TerritoryKind.Univ
  const isEntrancePrimary = !isPhonePrimary && !isHomesPrimary

  const parts: string[] = []
  if (!isHomesPrimary && content.homes > 0) parts.push(m.territories_map_popup_impact_homes({ count: content.homes }))
  if (!isPhonePrimary && content.phones > 0)
    parts.push(m.territories_map_popup_impact_phones({ count: content.phones }))
  if (content.liberals > 0) parts.push(m.territories_map_popup_impact_liberals({ count: content.liberals }))
  if (!isEntrancePrimary) parts.push(m.territories_map_popup_impact_addresses({ count: content.entranceCount }))
  return parts
}

function ImpactReadyView({ content, entrance }: { content: TerritoryContent; entrance: BboxEntrance }) {
  const summary = summariseImpact(content, entrance)
  const secondary = secondaryAggregates(content)
  return (
    <>
      <p className="mt-1 text-muted-foreground text-xs">{summary.current}</p>
      <p className="text-muted-foreground text-xs italic">{summary.afterRemoval}</p>
      {secondary.length > 0 ? (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{secondary.join(' · ')}</p>
      ) : null}
    </>
  )
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
      {state.status === 'ready' ? <ImpactReadyView content={state.content} entrance={entrance} /> : null}
    </div>
  )
}

// ─── Access badges + prospection date ─────────────────────────────────────

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

// ─── Shared presentational pieces ─────────────────────────────────────────

function PopupFrame({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <div className="flex min-w-[280px] max-w-[340px] flex-col gap-1.5 m-3">
      <div className={`-mx-3 -mt-3 mb-1 h-1 rounded-t-lg ${accent}`} aria-hidden="true" />
      {children}
    </div>
  )
}

function PopupHeader({ entrance, territoryType }: { entrance: BboxEntrance; territoryType: TerritoryKind }) {
  const badges = accessBadges(entrance)
  const prospectedOn = formatProspectionDate(entrance.prospectionDate)
  return (
    <>
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
    </>
  )
}

function PopupFooter({
  label,
  variant,
  onClick,
}: {
  label: string
  variant: 'default' | 'outline' | 'destructive'
  onClick: () => void
}) {
  return (
    <div className="-mx-3 -mb-3 mt-1 border-t px-3 py-2">
      <Button type="button" size="sm" variant={variant} onClick={onClick} className="w-full">
        {label}
      </Button>
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

// ─── Per-status bodies ────────────────────────────────────────────────────

function AvailableBody({ entrance, pending, onAct }: BodyProps) {
  const isPending = pending !== 'none'
  const status = pendingStatusText(pending, entrance) ?? m.territories_map_status_available()
  return (
    <>
      <p className="text-muted-foreground text-xs">{status}</p>
      <NavigationLinks entrance={entrance} />
      <PopupFooter
        label={isPending ? m.territories_map_action_undo() : m.territories_map_action_add()}
        variant={isPending ? 'outline' : 'default'}
        onClick={onAct}
      />
    </>
  )
}

function InTerritoryBody({ entrance, pending, onAct }: BodyProps) {
  const isPending = pending !== 'none'
  const status = pendingStatusText(pending, entrance) ?? m.territories_map_status_in_territory()
  return (
    <>
      <p className="text-muted-foreground text-xs">{status}</p>
      <NavigationLinks entrance={entrance} />
      <PopupFooter
        label={isPending ? m.territories_map_action_undo() : m.territories_map_action_remove()}
        variant={isPending ? 'outline' : 'destructive'}
        onClick={onAct}
      />
    </>
  )
}

function OnOtherBody({ entrance, pending, onAct, onConfirmReassign }: BodyProps & { onConfirmReassign: () => void }) {
  const isPending = pending !== 'none'
  const otherTerritory = entrance.otherTerritory
  if (otherTerritory == null) return null

  const status =
    pendingStatusText(pending, entrance) ??
    m.territories_map_status_on_other_territory({ number: otherTerritory.number })

  return (
    <>
      <p className="text-muted-foreground text-xs">{status}</p>
      <ImpactBlock entrance={entrance} territoryNumber={otherTerritory.number} />
      <NavigationLinks entrance={entrance} />
      <PopupFooter
        label={
          isPending
            ? m.territories_map_action_undo()
            : m.territories_map_action_reassign_with_source({ number: otherTerritory.number })
        }
        variant={isPending ? 'outline' : 'destructive'}
        onClick={isPending ? onAct : onConfirmReassign}
      />
    </>
  )
}

// ─── Reassign confirm dialog ──────────────────────────────────────────────

function ReassignConfirmDialog({
  otherTerritory,
  accent,
  onCancel,
  onConfirm,
}: {
  otherTerritory: { id: number; number: string }
  accent: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="flex min-w-[280px] max-w-[340px] flex-col gap-2 m-[12px]">
      <div className={`-mx-3 -mt-3 mb-1 h-1 rounded-t ${accent}`} aria-hidden="true" />
      <p className="font-semibold text-base">{m.territories_map_reassign_confirm_title()}</p>
      <p className="text-muted-foreground text-xs">
        {m.territories_map_reassign_confirm_body({ number: otherTerritory.number })}
      </p>
      <div className="-mx-3 -mb-3 mt-1 flex gap-2 border-t px-3 py-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel} className="flex-1">
          {m.territories_map_reassign_confirm_cancel()}
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={onConfirm} className="flex-1">
          {m.territories_map_reassign_confirm_submit()}
        </Button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────

export default function EntrancePopup({ entrance, territoryType, pending, onAct }: Props) {
  const [confirmingReassign, setConfirmingReassign] = useState(false)
  const accent = accentClassFor(entrance, pending)

  if (confirmingReassign && entrance.otherTerritory != null) {
    return (
      <ReassignConfirmDialog
        otherTerritory={entrance.otherTerritory}
        accent={accent}
        onCancel={() => setConfirmingReassign(false)}
        onConfirm={() => {
          setConfirmingReassign(false)
          onAct()
        }}
      />
    )
  }

  return (
    <PopupFrame accent={accent}>
      <PopupHeader entrance={entrance} territoryType={territoryType} />
      {entrance.status === 'in-this-territory' ? (
        <InTerritoryBody entrance={entrance} pending={pending} onAct={onAct} />
      ) : entrance.status === 'on-other-territory' ? (
        <OnOtherBody
          entrance={entrance}
          pending={pending}
          onAct={onAct}
          onConfirmReassign={() => setConfirmingReassign(true)}
        />
      ) : (
        <AvailableBody entrance={entrance} pending={pending} onAct={onAct} />
      )}
    </PopupFrame>
  )
}
