import { ExternalLink, Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'
import { entranceContentLabel } from '~/features/territories/server/entrance-content-label'
import type { EditPendingState } from '~/features/territories/ui/EntrancePopup'
import * as m from '~/i18n/paraglide/messages'
import type { AggregatedEntrance } from '~/shared/types/entrance'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'

type ListEntry = {
  id: number
  number: string
  street: string
  zip: string
  contentLabel: string
  latitude: number | null
  longitude: number | null
  pendingState: EditPendingState
  fromTerritoryNumber?: string
  buildingId?: number
}

export function pendingBorderClassFor(state: EditPendingState): string {
  if (state === 'pending-add') return 'border-l-4 border-l-primary/60'
  if (state === 'pending-remove') return 'border-l-4 border-l-destructive/60'
  if (state === 'pending-reassign') return 'border-l-4 border-l-primary/60 border-dashed'
  return ''
}

function PendingBadge({ entry }: { entry: ListEntry }) {
  if (entry.pendingState === 'pending-add') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary text-xs">
        <Plus className="size-3" aria-hidden="true" />
        {m.territories_edit_badge_add()}
      </span>
    )
  }
  if (entry.pendingState === 'pending-remove') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-destructive text-xs">
        <Trash2 className="size-3" aria-hidden="true" />
        {m.territories_edit_badge_remove()}
      </span>
    )
  }
  if (entry.pendingState === 'pending-reassign') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary text-xs">
        <RotateCcw className="size-3" aria-hidden="true" />
        {m.territories_edit_badge_reassign({
          number: entry.fromTerritoryNumber ?? '',
        })}
      </span>
    )
  }
  return null
}

type PendingEntranceListProps = {
  savedTerritoryEntrances: AggregatedEntrance[]
  pendingAdditions: Map<number, BboxEntrance>
  pendingRemovals: Map<number, BboxEntrance | AggregatedEntrance>
  pendingReassignments: Map<number, { entrance: BboxEntrance; fromTerritoryId: number; fromTerritoryNumber: string }>
  territoryType: TerritoryKind
  showMap: boolean
  onFocusEntrance: (entranceId: number) => void
  onRevert: (entranceId: number) => void
  onRemoveById: (entranceId: number) => void
}

export function PendingEntranceList({
  savedTerritoryEntrances,
  pendingAdditions,
  pendingRemovals,
  pendingReassignments,
  territoryType,
  showMap,
  onFocusEntrance,
  onRevert,
  onRemoveById,
}: PendingEntranceListProps) {
  const listEntries: ListEntry[] = []
  for (const e of savedTerritoryEntrances) {
    const pendingState = pendingRemovals.has(e.id) ? 'pending-remove' : 'none'
    listEntries.push({
      id: e.id,
      number: e.number,
      street: e.street,
      zip: e.zip,
      contentLabel: entranceContentLabel(territoryType, e),
      latitude: e.latitude,
      longitude: e.longitude,
      pendingState,
      buildingId: e.buildings[0]?.id,
    })
  }
  for (const e of pendingAdditions.values()) {
    listEntries.push({
      id: e.id,
      number: e.address.number,
      street: e.address.street,
      zip: e.address.zip,
      contentLabel: entranceContentLabel(territoryType, e),
      latitude: e.latitude,
      longitude: e.longitude,
      pendingState: 'pending-add',
    })
  }
  for (const value of pendingReassignments.values()) {
    const e = value.entrance
    listEntries.push({
      id: e.id,
      number: e.address.number,
      street: e.address.street,
      zip: e.address.zip,
      contentLabel: entranceContentLabel(territoryType, e),
      latitude: e.latitude,
      longitude: e.longitude,
      pendingState: 'pending-reassign',
      fromTerritoryNumber: value.fromTerritoryNumber,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>{m.territories_form_entrances_heading()}</span>
          <span className="text-muted-foreground text-sm">({listEntries.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {listEntries.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">{m.territories_edit_no_entrances()}</p>
        ) : (
          listEntries.map(entry => {
            const focusable = showMap && entry.latitude != null && entry.longitude != null
            const labelContent = (
              <div className="flex flex-col text-left">
                <span
                  className={`font-medium ${entry.pendingState === 'pending-remove' ? 'line-through opacity-60' : ''}`}
                >
                  {entry.number} {entry.street}, {entry.zip}
                </span>
                <span className="text-muted-foreground text-sm">{entry.contentLabel}</span>
              </div>
            )
            return (
              <div
                key={entry.id}
                className={`flex items-center justify-between gap-3 rounded-md border p-3 transition ${pendingBorderClassFor(entry.pendingState)} ${focusable ? 'hover:border-primary' : ''}`}
              >
                <div className="flex flex-1 items-center gap-2">
                  {focusable ? (
                    <button
                      type="button"
                      onClick={() => onFocusEntrance(entry.id)}
                      title={m.territories_edit_focus_on_map_title()}
                      className="-m-1 flex-1 cursor-pointer rounded p-1 hover:bg-accent/40"
                    >
                      {labelContent}
                    </button>
                  ) : (
                    labelContent
                  )}
                  {entry.pendingState !== 'none' ? <PendingBadge entry={entry} /> : null}
                </div>
                <div className="flex gap-2">
                  {entry.buildingId != null ? (
                    <Button variant="ghost" size="icon" asChild>
                      <a
                        href={`/territories/building/${entry.buildingId}/view`}
                        target="_blank"
                        rel="noreferrer"
                        title={m.territories_form_view_building_title()}
                      >
                        <ExternalLink className="size-4 text-primary" />
                      </a>
                    </Button>
                  ) : null}
                  {entry.pendingState !== 'none' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => onRevert(entry.id)}
                      title={m.territories_map_pending_revert_title()}
                    >
                      {m.territories_map_action_undo()}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onRemoveById(entry.id)}
                      title={m.territories_form_remove_building_title()}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
