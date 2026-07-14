import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'
import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { SplitToolCreateActionResult } from '~/features/territories/routes/split-tool/create'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'
import { DraftTerritoryRail } from '~/features/territories/ui/DraftTerritoryRail'
import { decideFetcherResult } from '~/features/territories/ui/decide-fetcher-result'
import EntrancePopup, { type CreatePendingState } from '~/features/territories/ui/EntrancePopup'
import { pinVariantFor } from '~/features/territories/ui/entrance-pin-variant'
import EntranceMapCanvas, { type EntranceFocusRequest } from '~/features/territories/ui/map/EntranceMapCanvas'
import type { Bbox } from '~/features/territories/ui/map/use-bbox-entrances'
import * as m from '~/i18n/paraglide/messages'

type Props = {
  apiKey?: string
  kind: TerritoryKind
  suggestedNumber: string
  fallbackCenter?: { lat: number; lng: number }
  /** Total entrances eligible for this kind — the tab count. Passed to the canvas so its "N sur M" chip has a denominator. */
  totalAvailable: number
  /** Subset of `totalAvailable` that lacks lat/lng and can never render on the map. */
  withoutCoordinates: number
}

function pendingStateFor(entrance: BboxEntrance, draft: ReadonlyMap<number, BboxEntrance>): CreatePendingState {
  return draft.has(entrance.id) ? 'pending-select' : 'none'
}

function markerAriaLabelFor(entrance: BboxEntrance, isSelected: boolean): string {
  const address = `${entrance.address.number} ${entrance.address.street}, ${entrance.address.zip}`
  if (isSelected) return `${address} — ${m.territories_map_status_pending_select()}`
  return `${address} — ${m.territories_map_aria_available()}`
}

export default function BuildingEntranceMapCreator({
  apiKey,
  kind,
  suggestedNumber,
  fallbackCenter,
  totalAvailable,
  withoutCoordinates,
}: Props) {
  const fetcher = useFetcher<SplitToolCreateActionResult>()

  const [draft, setDraft] = useState<Map<number, BboxEntrance>>(() => new Map())
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [focusRequest, setFocusRequest] = useState<EntranceFocusRequest | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // See `decide-fetcher-result.ts` for why we dedup by data-object identity rather than
  // observing the `submitting → idle` state transition.
  const processedDataRef = useRef<SplitToolCreateActionResult | null>(null)
  useEffect(() => {
    const decision = decideFetcherResult(fetcher.state, fetcher.data, processedDataRef.current)
    if (decision.action === 'skip') return
    processedDataRef.current = fetcher.data ?? null

    if (decision.action === 'success') {
      toast.success(m.split_tool_create_flash_success({ number: decision.data.number }))
      setDraft(new Map())
      setSelectedId(null)
      setRefreshKey(k => k + 1)
      // No manual revalidator.revalidate() — react-router auto-revalidates loaders after a
      // fetcher submit, so `suggestedNumber` refreshes on its own.
    } else {
      toast.error(decision.error)
    }
  }, [fetcher.state, fetcher.data])

  const toggleDraft = useCallback((entrance: BboxEntrance) => {
    setDraft(prev => {
      const next = new Map(prev)
      if (next.has(entrance.id)) next.delete(entrance.id)
      else next.set(entrance.id, entrance)
      return next
    })
  }, [])

  const buildUrl = useCallback(
    (bbox: Bbox) => {
      const params = new URLSearchParams({
        mode: 'create',
        kind,
        bbox: `${bbox.swLat},${bbox.swLng},${bbox.neLat},${bbox.neLng}`,
      })
      return `/territories/api/entrances-in-bbox?${params.toString()}`
    },
    [kind],
  )

  const invalidateOnIds = useMemo(() => [...draft.keys()], [draft])
  const extraEntrances = useMemo(() => [...draft.values()], [draft])

  return (
    <div className="flex gap-6 max-lg:flex-col lg:items-start">
      <EntranceMapCanvas
        apiKey={apiKey}
        buildUrl={buildUrl}
        extraEntrances={extraEntrances}
        invalidateOnIds={invalidateOnIds}
        selectedId={selectedId}
        onMarkerSelect={entrance => setSelectedId(entrance.id)}
        onCloseSelected={() => setSelectedId(null)}
        pinVariantFor={entrance => pinVariantFor(entrance, pendingStateFor(entrance, draft))}
        ariaLabelFor={entrance => markerAriaLabelFor(entrance, draft.has(entrance.id))}
        renderPopover={(entrance, close) => (
          <EntrancePopup
            entrance={entrance}
            territoryType={kind}
            pending={pendingStateFor(entrance, draft)}
            onAct={() => {
              toggleDraft(entrance)
              close()
            }}
          />
        )}
        focusRequest={focusRequest}
        refreshKey={refreshKey}
        fallbackCenter={fallbackCenter}
        totalAvailable={totalAvailable}
        withoutCoordinates={withoutCoordinates}
        className="h-[calc(100vh-16rem)] flex-1 lg:sticky lg:top-4 lg:self-start max-lg:h-[60vh]"
      />

      <DraftTerritoryRail
        kind={kind}
        draft={draft}
        suggestedNumber={suggestedNumber}
        onFocusEntrance={entranceId => setFocusRequest({ id: entranceId, nonce: Date.now() })}
        onRemove={entranceId => {
          const entrance = draft.get(entranceId)
          if (entrance != null) toggleDraft(entrance)
        }}
        onClear={() => setDraft(new Map())}
        fetcher={fetcher}
      />
    </div>
  )
}
