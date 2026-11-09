import { useCallback, useEffect, useMemo, useState } from 'react'

import type { StreetGroup } from '~/features/territories/model/holder-territory'
import { entranceRowId, HolderEntranceList } from '~/features/territories/ui/HolderEntranceList'
import { HolderTerritoryMap } from '~/features/territories/ui/HolderTerritoryMap'
import { useMediaQuery } from '~/shared/ui/hooks/use-media-query'
import { cn } from '~/shared/utils/utils'

export type HolderView = 'list' | 'map'

// Matches Tailwind's `xl`: from here the list and the map sit side by side.
const SIDE_BY_SIDE = '(min-width: 1280px)'

interface HolderTerritoryBodyProps {
  streets: StreetGroup[]
  territoryType: string
  showPhone: boolean
  /** The Maps key and the territory's number; null when there is no map to show. */
  map: { apiKey: string; number: string } | null
  /** Below xl one of them at a time, as the page's « Liste / Carte » switch says. */
  view: HolderView
  onViewChange: (view: HolderView) => void
}

/**
 * A held territory's entrances and its map, linked: pointing at an entrance raises its pins, picking one
 * (in the list or on the map) opens its card on the map, and the card leads back to its row.
 */
export function HolderTerritoryBody({
  streets,
  territoryType,
  showPhone,
  map,
  view,
  onViewChange,
}: HolderTerritoryBodyProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [rowToShow, setRowToShow] = useState<number | null>(null)
  const sideBySide = useMediaQuery(SIDE_BY_SIDE)
  const entrances = useMemo(() => streets.flatMap(street => street.entrances), [streets])

  // On a phone, picking an entrance in the list shows it on the map, as « Voir dans la liste » leads back.
  const selectFromList = useCallback(
    (id: number) => {
      setSelectedId(id)
      if (sideBySide === false) onViewChange('map')
    },
    [sideBySide, onViewChange],
  )
  const showInList = useCallback(
    (id: number) => {
      if (sideBySide === false) onViewChange('list')
      setRowToShow(id)
    },
    [sideBySide, onViewChange],
  )
  const close = useCallback(() => setSelectedId(null), [])

  // Once the list is on screen, its row comes into view and takes the focus.
  useEffect(() => {
    if (rowToShow == null || (sideBySide === false && view !== 'list')) return
    const row = document.getElementById(entranceRowId(rowToShow))
    row?.scrollIntoView({ block: 'center' })
    row?.querySelector('button')?.focus({ preventScroll: true })
    setRowToShow(null)
  }, [rowToShow, sideBySide, view])

  const list =
    streets.length > 0 ? (
      <HolderEntranceList
        streets={streets}
        territoryType={territoryType}
        showPhone={showPhone}
        focus={map == null ? undefined : { hoveredId, selectedId, onHover: setHoveredId, onSelect: selectFromList }}
      />
    ) : null

  if (map == null) {
    return (
      <div data-sticky-content="" className="grid items-start gap-6">
        {list}
      </div>
    )
  }

  return (
    <div data-sticky-content="" className="grid items-start gap-6 xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
      {list != null && <div className={cn(view === 'map' && 'max-xl:hidden')}>{list}</div>}
      <div className={cn('xl:sticky xl:top-6', view === 'list' && 'max-xl:hidden')}>
        <HolderTerritoryMap
          apiKey={map.apiKey}
          number={map.number}
          entrances={entrances}
          territoryType={territoryType}
          showPhone={showPhone}
          hoveredId={hoveredId}
          selectedId={selectedId}
          onHover={setHoveredId}
          onSelect={setSelectedId}
          onClose={close}
          onShowInList={showInList}
          fillScreen={sideBySide === false && view === 'map'}
        />
      </div>
    </div>
  )
}
