import { Minus, Plus, RotateCcw, X } from 'lucide-react'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'
import { computeTerritoryQuantity } from '~/features/territories/server/compute-territory-quantity'
import * as m from '~/i18n/paraglide/messages'
import type { AggregatedEntrance } from '~/shared/types/entrance'
import { Button } from '~/shared/ui/button'

type Props = {
  territoryType: TerritoryKindKey
  initialEntrances: AggregatedEntrance[]
  pendingAdditions: ReadonlyMap<number, BboxEntrance>
  pendingRemovals: ReadonlyMap<number, BboxEntrance | AggregatedEntrance>
  pendingReassignments: ReadonlyMap<number, { entrance: BboxEntrance; fromTerritoryNumber: string }>
  onRevert: (entranceId: number) => void
}

function bboxToAggregated(entrance: BboxEntrance): AggregatedEntrance {
  return {
    id: entrance.id,
    kind: entrance.kind,
    homes: entrance.homes,
    phones: entrance.phones,
    liberals: entrance.liberals,
    street: entrance.address.street,
    zip: entrance.address.zip,
    number: entrance.address.number,
    entranceNotes: '',
    shopKind: '',
    notes: '',
    access: null,
    isPMR: null,
    isOpenEarly: null,
    isMailboxOpen: null,
    latitude: entrance.latitude,
    longitude: entrance.longitude,
    congregationId: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    accesses: [],
    residentialData: [],
    buildings: [],
  } as unknown as AggregatedEntrance
}

function entranceLabel(e: BboxEntrance | AggregatedEntrance) {
  const isBbox = (entrance: BboxEntrance | AggregatedEntrance): entrance is BboxEntrance =>
    'address' in entrance && entrance.address != null
  if (isBbox(e)) {
    return `${e.address.number} ${e.address.street}, ${e.address.zip}`
  }
  return `${e.number} ${e.street}, ${e.zip}`
}

export default function PendingChangesRail({
  territoryType,
  initialEntrances,
  pendingAdditions,
  pendingRemovals,
  pendingReassignments,
  onRevert,
}: Props) {
  const initialQuantity = computeTerritoryQuantity(territoryType, initialEntrances)
  const projectedEntrances = [
    ...initialEntrances.filter(e => !pendingRemovals.has(e.id)),
    ...[...pendingAdditions.values()].map(bboxToAggregated),
    ...[...pendingReassignments.values()].map(r => bboxToAggregated(r.entrance)),
  ]
  const projectedQuantity = computeTerritoryQuantity(territoryType, projectedEntrances)
  const delta = projectedQuantity - initialQuantity
  const additionsCount = pendingAdditions.size
  const removalsCount = pendingRemovals.size
  const reassignmentsCount = pendingReassignments.size
  const hasPending = additionsCount + removalsCount + reassignmentsCount > 0

  if (!hasPending) return null

  const revertAll = () => {
    for (const id of pendingAdditions.keys()) onRevert(id)
    for (const id of pendingRemovals.keys()) onRevert(id)
    for (const id of pendingReassignments.keys()) onRevert(id)
  }
  const revertAllAdditions = () => {
    for (const id of pendingAdditions.keys()) onRevert(id)
  }
  const revertAllRemovals = () => {
    for (const id of pendingRemovals.keys()) onRevert(id)
  }
  const revertAllReassignments = () => {
    for (const id of pendingReassignments.keys()) onRevert(id)
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-base">{m.territories_map_pending_heading()}</h3>
        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={revertAll}>
          {m.territories_map_pending_revert_all()}
        </Button>
      </div>
      <p className="font-medium text-sm">
        {delta === 0
          ? m.territories_map_pending_quantity_unchanged({ count: String(projectedQuantity) })
          : m.territories_map_pending_quantity({
              from: String(initialQuantity),
              to: String(projectedQuantity),
              delta: delta > 0 ? `+${delta}` : String(delta),
            })}
      </p>

      {additionsCount > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              {m.territories_map_pending_additions({ count: String(additionsCount) })}
            </p>
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={revertAllAdditions}>
              {m.territories_map_pending_revert_section()}
            </Button>
          </div>
          <ul className="flex flex-col gap-1">
            {[...pendingAdditions.values()].map(entrance => (
              <li
                key={entrance.id}
                className="flex items-center justify-between gap-2 rounded border-l-2 border-primary/40 bg-primary/5 px-2 py-1 text-sm"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Plus className="size-3 shrink-0 text-primary" aria-hidden="true" />
                  {entranceLabel(entrance)}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => onRevert(entrance.id)}
                  title={m.territories_map_pending_revert_title()}
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {removalsCount > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              {m.territories_map_pending_removals({ count: String(removalsCount) })}
            </p>
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={revertAllRemovals}>
              {m.territories_map_pending_revert_section()}
            </Button>
          </div>
          <ul className="flex flex-col gap-1">
            {[...pendingRemovals.values()].map(entrance => (
              <li
                key={entrance.id}
                className="flex items-center justify-between gap-2 rounded border-l-2 border-destructive/40 bg-destructive/5 px-2 py-1 text-sm"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Minus className="size-3 shrink-0 text-destructive" aria-hidden="true" />
                  {entranceLabel(entrance)}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => onRevert(entrance.id)}
                  title={m.territories_map_pending_revert_title()}
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {reassignmentsCount > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              {m.territories_map_pending_reassignments({ count: String(reassignmentsCount) })}
            </p>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={revertAllReassignments}
            >
              {m.territories_map_pending_revert_section()}
            </Button>
          </div>
          <ul className="flex flex-col gap-1">
            {[...pendingReassignments.values()].map(({ entrance, fromTerritoryNumber }) => (
              <li
                key={entrance.id}
                className="flex items-center justify-between gap-2 rounded border-primary/40 border-l-2 border-dashed bg-primary/5 px-2 py-1 text-sm"
              >
                <span className="flex flex-col">
                  <span className="inline-flex items-center gap-1.5">
                    <RotateCcw className="size-3 shrink-0 text-primary" aria-hidden="true" />
                    {entranceLabel(entrance)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {m.territories_map_reassignment_from({ number: fromTerritoryNumber })}
                  </span>
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => onRevert(entrance.id)}
                  title={m.territories_map_pending_revert_title()}
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
