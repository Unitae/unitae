import { useCallback, useMemo, useState } from 'react'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'
import { territoryContentLabel } from '~/features/territories/server/territory-content-label'
import type { EntranceAction, EntranceFocusRequest } from '~/features/territories/ui/BuildingEntranceMapEditor'
import type { AggregatedEntrance } from '~/shared/types/entrance'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'

type ReassignmentPending = {
  entrance: BboxEntrance
  fromTerritoryId: number
  fromTerritoryNumber: string
}

export function ownEntranceToBbox(entrance: AggregatedEntrance): BboxEntrance | null {
  if (entrance.latitude == null || entrance.longitude == null) return null
  const building = entrance.buildings[0]
  if (building == null) return null
  return {
    id: entrance.id,
    latitude: entrance.latitude,
    longitude: entrance.longitude,
    kind: entrance.kind,
    shopKind: entrance.shopKind,
    homes: entrance.homes,
    phones: entrance.phones,
    liberals: entrance.liberals,
    address: {
      number: entrance.number,
      street: entrance.street,
      zip: entrance.zip,
    },
    buildingId: building.id,
    status: 'in-this-territory',
    otherTerritory: null,
    access: entrance.access,
    accesses: (entrance.accesses ?? []).map(a => ({ type: a.type })),
    isPMR: entrance.isPMR,
    isOpenEarly: entrance.isOpenEarly,
    isMailboxOpen: entrance.isMailboxOpen,
    prospectionDate: building.prospectionDate?.toISOString() ?? null,
  }
}

export function useEntrancePendingState(
  savedTerritoryEntrances: AggregatedEntrance[],
  territoryType: TerritoryKindKey,
) {
  const { blocker, markDirty } = useUnsavedChanges()

  const [pendingAdditions, setPendingAdditions] = useState<Map<number, BboxEntrance>>(new Map())
  const [pendingRemovals, setPendingRemovals] = useState<Map<number, BboxEntrance | AggregatedEntrance>>(new Map())
  const [pendingReassignments, setPendingReassignments] = useState<Map<number, ReassignmentPending>>(new Map())
  const [focusRequest, setFocusRequest] = useState<EntranceFocusRequest | null>(null)

  const handleFocusEntrance = useCallback((entranceId: number) => {
    setFocusRequest(prev => ({
      id: entranceId,
      nonce: (prev?.nonce ?? 0) + 1,
    }))
  }, [])

  const projectedEntranceIds = useMemo(() => {
    const ids = new Set<number>()
    for (const e of savedTerritoryEntrances) {
      if (!pendingRemovals.has(e.id)) ids.add(e.id)
    }
    for (const id of pendingAdditions.keys()) ids.add(id)
    for (const id of pendingReassignments.keys()) ids.add(id)
    return ids
  }, [savedTerritoryEntrances, pendingRemovals, pendingAdditions, pendingReassignments])

  const projectedContent = useMemo(() => {
    const entrances: { homes: number | null; phones: number | null }[] = []
    for (const e of savedTerritoryEntrances) {
      if (!pendingRemovals.has(e.id)) entrances.push(e)
    }
    for (const e of pendingAdditions.values()) entrances.push(e)
    for (const r of pendingReassignments.values()) entrances.push(r.entrance)
    return territoryContentLabel(territoryType, entrances)
  }, [savedTerritoryEntrances, pendingRemovals, pendingAdditions, pendingReassignments, territoryType])

  const handleAct = useCallback(
    (entrance: BboxEntrance, action: EntranceAction) => {
      markDirty()
      if (action === 'undo') {
        setPendingAdditions(prev => {
          const next = new Map(prev)
          next.delete(entrance.id)
          return next
        })
        setPendingRemovals(prev => {
          const next = new Map(prev)
          next.delete(entrance.id)
          return next
        })
        setPendingReassignments(prev => {
          const next = new Map(prev)
          next.delete(entrance.id)
          return next
        })
        return
      }
      if (action === 'add') {
        setPendingAdditions(prev => new Map(prev).set(entrance.id, entrance))
        return
      }
      if (action === 'remove') {
        setPendingRemovals(prev => new Map(prev).set(entrance.id, entrance))
        return
      }
      if (action === 'reassign' && entrance.otherTerritory != null) {
        const other = entrance.otherTerritory
        setPendingReassignments(prev =>
          new Map(prev).set(entrance.id, {
            entrance,
            fromTerritoryId: other.id,
            fromTerritoryNumber: other.number,
          }),
        )
      }
    },
    [markDirty],
  )

  const handleListRemove = useCallback(
    (entrance: AggregatedEntrance) => {
      markDirty()
      setPendingRemovals(prev => new Map(prev).set(entrance.id, entrance))
    },
    [markDirty],
  )

  const handleSelectorChange = useCallback(
    (selection: AggregatedEntrance[]) => {
      markDirty()
      const ownIds = new Set(savedTerritoryEntrances.map(e => e.id))
      setPendingAdditions(prev => {
        const next = new Map(prev)
        for (const entrance of selection) {
          if (ownIds.has(entrance.id) || next.has(entrance.id)) continue
          const bbox = ownEntranceToBbox(entrance)
          if (bbox != null) next.set(entrance.id, bbox)
        }
        return next
      })
    },
    [savedTerritoryEntrances, markDirty],
  )

  const handleRevert = useCallback((entranceId: number) => {
    setPendingAdditions(prev => {
      if (!prev.has(entranceId)) return prev
      const next = new Map(prev)
      next.delete(entranceId)
      return next
    })
    setPendingRemovals(prev => {
      if (!prev.has(entranceId)) return prev
      const next = new Map(prev)
      next.delete(entranceId)
      return next
    })
    setPendingReassignments(prev => {
      if (!prev.has(entranceId)) return prev
      const next = new Map(prev)
      next.delete(entranceId)
      return next
    })
  }, [])

  const handleListRemoveById = useCallback(
    (entranceId: number) => {
      const entrance = savedTerritoryEntrances.find(e => e.id === entranceId)
      if (entrance != null) handleListRemove(entrance)
    },
    [savedTerritoryEntrances, handleListRemove],
  )

  const pendingChangesCount = pendingAdditions.size + pendingRemovals.size + pendingReassignments.size

  return {
    pendingAdditions,
    pendingRemovals,
    pendingReassignments,
    focusRequest,
    projectedEntranceIds,
    projectedContent,
    pendingChangesCount,
    handleAct,
    handleListRemove,
    handleSelectorChange,
    handleRevert,
    handleListRemoveById,
    handleFocusEntrance,
    blocker,
    markDirty,
  }
}
