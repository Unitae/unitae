import { useCallback, useMemo, useState } from 'react'
import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'
import EntrancePopup, { type EntrancePendingState } from '~/features/territories/ui/EntrancePopup'
import { pinVariantFor } from '~/features/territories/ui/entrance-pin-variant'
import EntranceMapCanvas, { type EntranceFocusRequest } from '~/features/territories/ui/map/EntranceMapCanvas'
import type { Bbox } from '~/features/territories/ui/map/use-bbox-entrances'
import * as m from '~/i18n/paraglide/messages'

export type EntranceAction = 'add' | 'remove' | 'reassign' | 'undo'

export type { EntranceFocusRequest }

type Props = {
  apiKey?: string
  territoryId: number
  territoryType: TerritoryKind
  ownEntrances: BboxEntrance[]
  pendingAdditions: ReadonlyMap<number, unknown>
  pendingRemovals: ReadonlyMap<number, unknown>
  pendingReassignments: ReadonlyMap<number, { fromTerritoryId: number; fromTerritoryNumber: string }>
  focusRequest?: EntranceFocusRequest | null
  onAct: (entrance: BboxEntrance, action: EntranceAction) => void
  className?: string
}

function pendingStateFor(
  entrance: BboxEntrance,
  pendingAdditions: ReadonlyMap<number, unknown>,
  pendingRemovals: ReadonlyMap<number, unknown>,
  pendingReassignments: ReadonlyMap<number, unknown>,
): EntrancePendingState {
  if (pendingRemovals.has(entrance.id)) return 'pending-remove'
  if (pendingReassignments.has(entrance.id)) return 'pending-reassign'
  if (pendingAdditions.has(entrance.id)) return 'pending-add'
  return 'none'
}

function markerAriaLabelFor(entrance: BboxEntrance, pending: EntrancePendingState): string {
  const address = `${entrance.address.number} ${entrance.address.street}, ${entrance.address.zip}`
  if (pending === 'pending-remove') return `${address} — ${m.territories_map_aria_pending_remove()}`
  if (pending === 'pending-add') return `${address} — ${m.territories_map_aria_pending_add()}`
  if (pending === 'pending-reassign') return `${address} — ${m.territories_map_aria_pending_reassign()}`
  if (entrance.status === 'in-this-territory') return `${address} — ${m.territories_map_aria_in_territory()}`
  if (entrance.status === 'available') return `${address} — ${m.territories_map_aria_available()}`
  return `${address} — ${m.territories_map_aria_on_other()}`
}

export default function BuildingEntranceMapEditor({
  apiKey,
  territoryId,
  territoryType,
  ownEntrances,
  pendingAdditions,
  pendingRemovals,
  pendingReassignments,
  focusRequest,
  onAct,
  className,
}: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const buildUrl = useCallback(
    (bbox: Bbox) => {
      const params = new URLSearchParams({
        bbox: `${bbox.swLat},${bbox.swLng},${bbox.neLat},${bbox.neLng}`,
        territoryId: String(territoryId),
      })
      return `/territories/api/entrances-in-bbox?${params.toString()}`
    },
    [territoryId],
  )

  const invalidateOnIds = useMemo(() => {
    return [...pendingAdditions.keys(), ...pendingRemovals.keys(), ...pendingReassignments.keys()]
  }, [pendingAdditions, pendingRemovals, pendingReassignments])

  const emptyState = useMemo(
    () =>
      ownEntrances.length === 0 && pendingAdditions.size === 0
        ? {
            title: m.territories_map_empty_state_title(),
            body: m.territories_map_empty_state_body(),
          }
        : undefined,
    [ownEntrances.length, pendingAdditions.size],
  )

  const fallbackCenter = useMemo(() => {
    const valid = ownEntrances.filter(e => e.latitude != null && e.longitude != null)
    if (valid.length === 0) return undefined
    return {
      lat: valid.reduce((s, e) => s + e.latitude, 0) / valid.length,
      lng: valid.reduce((s, e) => s + e.longitude, 0) / valid.length,
    }
  }, [ownEntrances])

  return (
    <EntranceMapCanvas
      apiKey={apiKey}
      buildUrl={buildUrl}
      extraEntrances={ownEntrances}
      invalidateOnIds={invalidateOnIds}
      selectedId={selectedId}
      onMarkerSelect={entrance => setSelectedId(entrance.id)}
      onCloseSelected={() => setSelectedId(null)}
      pinVariantFor={entrance =>
        pinVariantFor(entrance, pendingStateFor(entrance, pendingAdditions, pendingRemovals, pendingReassignments))
      }
      ariaLabelFor={entrance =>
        markerAriaLabelFor(entrance, pendingStateFor(entrance, pendingAdditions, pendingRemovals, pendingReassignments))
      }
      renderPopover={(entrance, close) => (
        <EntrancePopup
          entrance={entrance}
          territoryType={territoryType}
          pending={pendingStateFor(entrance, pendingAdditions, pendingRemovals, pendingReassignments)}
          onAct={() => {
            const pending = pendingStateFor(entrance, pendingAdditions, pendingRemovals, pendingReassignments)
            if (pending !== 'none') {
              onAct(entrance, 'undo')
            } else if (entrance.status === 'in-this-territory') {
              onAct(entrance, 'remove')
            } else if (entrance.status === 'available') {
              onAct(entrance, 'add')
            } else {
              onAct(entrance, 'reassign')
            }
            close()
          }}
        />
      )}
      focusRequest={focusRequest}
      emptyState={emptyState}
      fallbackCenter={fallbackCenter}
      className={className}
    />
  )
}
