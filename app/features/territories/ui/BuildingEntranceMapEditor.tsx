import { MarkerClusterer } from "@googlemaps/markerclusterer";
import {
  AdvancedMarker,
  type AdvancedMarkerRef,
  APIProvider as GoogleMapApiProvider,
  ControlPosition,
  InfoWindow,
  Map as GoogleMap,
  useMap,
} from "@vis.gl/react-google-maps";
import { Info, Loader2, MapPin, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TerritoryKind } from "~/features/territories/model/territory-kind.type";
import type { BboxEntrance } from "~/features/territories/server/buildings.server";
import { EntranceMarkerPin } from "~/features/territories/ui/EntranceMarkerPin";
import EntrancePopup, {
  type EntrancePendingState,
} from "~/features/territories/ui/EntrancePopup";
import { pinVariantFor } from "~/features/territories/ui/entrance-pin-variant";
import MapSearchBox from "~/features/territories/ui/MapSearchBox";
import MarkerLegend from "~/features/territories/ui/MarkerLegend";
import * as m from "~/paraglide/messages";
import { Card, CardContent } from "~/shared/ui/card";
import MapConsentBanner, { useMapConsent } from "~/shared/ui/MapConsentBanner";

export type EntranceAction = "add" | "remove" | "reassign" | "undo";

export type EntranceFocusRequest = { id: number; nonce: number };

type Props = {
  apiKey?: string;
  territoryId: number;
  territoryType: TerritoryKind;
  ownEntrances: BboxEntrance[];
  pendingAdditions: ReadonlySet<number>;
  pendingRemovals: ReadonlySet<number>;
  pendingReassignments: ReadonlyMap<
    number,
    { fromTerritoryId: number; fromTerritoryNumber: string }
  >;
  focusRequest?: EntranceFocusRequest | null;
  onAct: (entrance: BboxEntrance, action: EntranceAction) => void;
  className?: string;
};

const GRID = 0.01;

function gridKey(bbox: {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}) {
  return [
    Math.floor(bbox.swLat / GRID),
    Math.floor(bbox.swLng / GRID),
    Math.ceil(bbox.neLat / GRID),
    Math.ceil(bbox.neLng / GRID),
  ].join(":");
}

function pendingStateFor(
  entrance: BboxEntrance,
  pendingAdditions: ReadonlySet<number>,
  pendingRemovals: ReadonlySet<number>,
  pendingReassignments: ReadonlyMap<number, unknown>,
): EntrancePendingState {
  if (pendingRemovals.has(entrance.id)) return "pending-remove";
  if (pendingReassignments.has(entrance.id)) return "pending-reassign";
  if (pendingAdditions.has(entrance.id)) return "pending-add";
  return "none";
}

function markerAriaLabelFor(
  entrance: BboxEntrance,
  pending: EntrancePendingState,
): string {
  const address = `${entrance.address.number} ${entrance.address.street}, ${entrance.address.zip}`;
  if (pending === "pending-remove")
    return `${address} — ${m.territories_map_aria_pending_remove()}`;
  if (pending === "pending-add")
    return `${address} — ${m.territories_map_aria_pending_add()}`;
  if (pending === "pending-reassign")
    return `${address} — ${m.territories_map_aria_pending_reassign()}`;
  if (entrance.status === "in-this-territory")
    return `${address} — ${m.territories_map_aria_in_territory()}`;
  if (entrance.status === "available")
    return `${address} — ${m.territories_map_aria_available()}`;
  return `${address} — ${m.territories_map_aria_on_other()}`;
}

function MapContents({
  territoryId,
  territoryType,
  ownEntrances,
  pendingAdditions,
  pendingRemovals,
  pendingReassignments,
  focusRequest,
  onAct,
}: Omit<Props, "apiKey" | "className">) {
  const map = useMap();
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const markerRefs = useRef<Map<number, AdvancedMarkerRef>>(new Map());
  const refCallbacks = useRef<Map<number, (marker: AdvancedMarkerRef) => void>>(
    new Map(),
  );
  const fetchAbort = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, BboxEntrance[]>>(new Map());
  const entranceToKeysRef = useRef<Map<number, Set<string>>>(new Map());
  const lastBboxRef = useRef<{
    swLat: number;
    swLng: number;
    neLat: number;
    neLng: number;
  } | null>(null);
  const [viewportEntrances, setViewportEntrances] = useState<BboxEntrance[]>(
    [],
  );
  const [truncated, setTruncated] = useState(false);
  const [truncatedTotal, setTruncatedTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<BboxEntrance | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ownById = useMemo(
    () => new Map(ownEntrances.map((e) => [e.id, e])),
    [ownEntrances],
  );

  const visibleEntrances = useMemo(() => {
    const merged = new Map<number, BboxEntrance>();
    for (const e of viewportEntrances) merged.set(e.id, e);
    for (const e of ownEntrances) merged.set(e.id, e);
    return [...merged.values()];
  }, [viewportEntrances, ownEntrances]);

  const loadBbox = useCallback(
    async (bbox: {
      swLat: number;
      swLng: number;
      neLat: number;
      neLng: number;
    }) => {
      lastBboxRef.current = bbox;
      const key = gridKey(bbox);
      const cached = cacheRef.current.get(key);
      if (cached != null) {
        setViewportEntrances(cached);
        setTruncated(false);
        setTruncatedTotal(null);
        setError(false);
        return;
      }

      fetchAbort.current?.abort();
      const ctrl = new AbortController();
      fetchAbort.current = ctrl;
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams({
          bbox: `${bbox.swLat},${bbox.swLng},${bbox.neLat},${bbox.neLng}`,
          territoryId: String(territoryId),
        });
        const response = await fetch(
          `/territories/api/entrances-in-bbox?${params.toString()}`,
          {
            signal: ctrl.signal,
            headers: { Accept: "application/json" },
          },
        );
        if (!response.ok) {
          throw new Error(`Bbox request failed: ${response.status}`);
        }
        const data = (await response.json()) as {
          entrances: BboxEntrance[];
          truncated: boolean;
          total: number | null;
        };
        cacheRef.current.set(key, data.entrances);
        for (const entrance of data.entrances) {
          let keys = entranceToKeysRef.current.get(entrance.id);
          if (keys == null) {
            keys = new Set();
            entranceToKeysRef.current.set(entrance.id, keys);
          }
          keys.add(key);
        }
        setViewportEntrances(data.entrances);
        setTruncated(data.truncated);
        setTruncatedTotal(data.total);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setError(true);
      } finally {
        if (fetchAbort.current === ctrl) {
          setLoading(false);
        }
      }
    },
    [territoryId],
  );

  const invalidateCacheFor = useCallback((entranceId: number) => {
    const keys = entranceToKeysRef.current.get(entranceId);
    if (keys == null) return;
    for (const key of keys) cacheRef.current.delete(key);
    entranceToKeysRef.current.delete(entranceId);
  }, []);

  // Invalidate cached bbox tiles whenever local pending state mutates an entrance — keeps
  // status badges accurate if the user pans away and returns to a tile they've already loaded.
  useEffect(() => {
    for (const id of pendingAdditions) invalidateCacheFor(id);
  }, [pendingAdditions, invalidateCacheFor]);
  useEffect(() => {
    for (const id of pendingRemovals) invalidateCacheFor(id);
  }, [pendingRemovals, invalidateCacheFor]);
  useEffect(() => {
    for (const id of pendingReassignments.keys()) invalidateCacheFor(id);
  }, [pendingReassignments, invalidateCacheFor]);

  const retryLastLoad = useCallback(() => {
    if (lastBboxRef.current != null) loadBbox(lastBboxRef.current);
  }, [loadBbox]);

  const handleIdle = useCallback(() => {
    if (map == null) return;
    const bounds = map.getBounds();
    if (bounds == null) return;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const bbox = {
      swLat: sw.lat(),
      swLng: sw.lng(),
      neLat: ne.lat(),
      neLng: ne.lng(),
    };
    if (debounceRef.current != null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadBbox(bbox), 300);
  }, [map, loadBbox]);

  useEffect(() => {
    if (map == null) return;
    const listener = map.addListener("idle", handleIdle);
    return () => listener.remove();
  }, [map, handleIdle]);

  // Trigger an initial load once the map is ready, in case `idle` already fired before the listener attached.
  useEffect(() => {
    if (map != null) {
      handleIdle();
    }
  }, [map, handleIdle]);

  // Initialize the clusterer once we have a map. Cleanup clears all markers.
  useEffect(() => {
    if (map == null) return;
    const clusterer = new MarkerClusterer({ map });
    clustererRef.current = clusterer;
    // Re-register any markers that mounted before the clusterer was ready.
    for (const marker of markerRefs.current.values()) {
      if (marker != null) clusterer.addMarker(marker, true);
    }
    clusterer.render();
    return () => {
      clusterer.clearMarkers();
      if (clustererRef.current === clusterer) clustererRef.current = null;
    };
  }, [map]);

  const getRefCallback = useCallback((id: number) => {
    const cached = refCallbacks.current.get(id);
    if (cached != null) return cached;
    const cb = (marker: AdvancedMarkerRef) => {
      const previous = markerRefs.current.get(id) ?? null;
      if (marker === previous) return;
      const clusterer = clustererRef.current;
      if (previous != null && clusterer != null)
        clusterer.removeMarker(previous, true);
      if (marker != null) {
        markerRefs.current.set(id, marker);
        if (clusterer != null) clusterer.addMarker(marker, true);
      } else {
        markerRefs.current.delete(id);
      }
      clusterer?.render();
    };
    refCallbacks.current.set(id, cb);
    return cb;
  }, []);

  const focusEntranceById = useCallback(
    (entranceId: number) => {
      if (map == null) return;
      const target =
        ownEntrances.find((e) => e.id === entranceId) ??
        viewportEntrances.find((e) => e.id === entranceId);
      if (target == null) return;
      map.panTo({ lat: target.latitude, lng: target.longitude });
      const currentZoom = map.getZoom();
      if (currentZoom == null || currentZoom < 16) {
        map.setZoom(17);
      }
      setSelected(target);
    },
    [map, ownEntrances, viewportEntrances],
  );

  // Focus a specific entrance on parent request: pan, zoom in if needed, and open its popup.
  useEffect(() => {
    if (focusRequest == null) return;
    focusEntranceById(focusRequest.id);
  }, [focusRequest, focusEntranceById]);

  return (
    <>
      {visibleEntrances
        .filter((e) => e.latitude != null && e.longitude != null)
        .map((entrance) => {
          const own = ownById.get(entrance.id);
          // Prefer the loaded entrance shape; fall back to the eagerly-loaded own shape so removed-then-out-of-view entrances stay visible.
          const display =
            entrance.status === "in-this-territory"
              ? entrance
              : (own ?? entrance);
          const pending = pendingStateFor(
            display,
            pendingAdditions,
            pendingRemovals,
            pendingReassignments,
          );
          return (
            <AdvancedMarker
              key={display.id}
              ref={getRefCallback(display.id)}
              position={{ lat: display.latitude, lng: display.longitude }}
              onClick={() => setSelected(display)}
            >
              <button
                type="button"
                aria-label={markerAriaLabelFor(display, pending)}
                title={`${display.address.number} ${display.address.street}`}
                className="rounded-full transition motion-safe:hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <EntranceMarkerPin variant={pinVariantFor(display, pending)} />
              </button>
            </AdvancedMarker>
          );
        })}

      {selected != null ? (
        <InfoWindow
          position={{ lat: selected.latitude, lng: selected.longitude }}
          pixelOffset={[0, -24]}
          maxWidth={380}
          onCloseClick={() => setSelected(null)}
          headerDisabled
        >
          <EntrancePopup
            entrance={selected}
            territoryType={territoryType}
            pending={pendingStateFor(
              selected,
              pendingAdditions,
              pendingRemovals,
              pendingReassignments,
            )}
            onAct={() => {
              const pending = pendingStateFor(
                selected,
                pendingAdditions,
                pendingRemovals,
                pendingReassignments,
              );
              if (pending !== "none") {
                onAct(selected, "undo");
              } else if (selected.status === "in-this-territory") {
                onAct(selected, "remove");
              } else if (selected.status === "available") {
                onAct(selected, "add");
              } else {
                onAct(selected, "reassign");
              }
              setSelected(null);
            }}
          />
        </InfoWindow>
      ) : null}

      <div className="pointer-events-none absolute top-3 right-3 flex flex-col items-end gap-1.5 text-xs">
        {loading ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card/95 px-2.5 py-1 text-foreground shadow-sm backdrop-blur">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            {m.territories_map_loading()}
          </span>
        ) : null}
        {truncated ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-primary shadow-sm backdrop-blur">
            <Info className="size-3" aria-hidden="true" />
            {truncatedTotal != null
              ? m.territories_map_truncated_hint_with_count({
                  total: String(truncatedTotal),
                })
              : m.territories_map_truncated_hint()}
          </span>
        ) : null}
        {error ? (
          <button
            type="button"
            onClick={retryLastLoad}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-destructive shadow-sm backdrop-blur hover:bg-destructive/20"
          >
            <RefreshCw className="size-3" aria-hidden="true" />
            {m.territories_map_load_error()}
          </button>
        ) : null}
      </div>

      {ownEntrances.length === 0 && pendingAdditions.size === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-2 rounded-lg border bg-card/95 p-4 text-center shadow-md backdrop-blur">
            <MapPin className="size-6 text-primary" aria-hidden="true" />
            <p className="font-medium text-sm">
              {m.territories_map_empty_state_title()}
            </p>
            <p className="text-muted-foreground text-xs">
              {m.territories_map_empty_state_body()}
            </p>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute top-3 left-7 flex flex-col gap-2">
        <MapSearchBox
          candidates={[...ownEntrances, ...viewportEntrances]}
          onSelect={focusEntranceById}
        />
        <MarkerLegend />
      </div>
    </>
  );
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
  const { consented, grantConsent } = useMapConsent();

  if (apiKey == null) return null;

  if (!consented) {
    return (
      <Card className={className}>
        <CardContent className="h-full p-0">
          <MapConsentBanner onAccept={grantConsent} />
        </CardContent>
      </Card>
    );
  }

  const validOwn = ownEntrances.filter(
    (e) => e.latitude != null && e.longitude != null,
  );
  const center =
    validOwn.length > 0
      ? {
          lat: validOwn.reduce((s, e) => s + e.latitude, 0) / validOwn.length,
          lng: validOwn.reduce((s, e) => s + e.longitude, 0) / validOwn.length,
        }
      : { lat: 45.737623, lng: 4.8371592 };

  return (
    <Card className={className}>
      <CardContent className="relative h-full p-0">
        <GoogleMapApiProvider apiKey={apiKey}>
          <GoogleMap
            mapId="unitae-territory-edit"
            defaultCenter={center}
            defaultZoom={validOwn.length > 0 ? 16 : 13}
            className="h-full min-h-[500px] w-full rounded-lg"
            disableDefaultUI={true}
            zoomControl={true}
            zoomControlOptions={{ position: ControlPosition.RIGHT_BOTTOM }}
            keyboardShortcuts={true}
            gestureHandling="greedy"
          >
            <MapContents
              territoryId={territoryId}
              territoryType={territoryType}
              ownEntrances={ownEntrances}
              pendingAdditions={pendingAdditions}
              pendingRemovals={pendingRemovals}
              pendingReassignments={pendingReassignments}
              focusRequest={focusRequest}
              onAct={onAct}
            />
          </GoogleMap>
        </GoogleMapApiProvider>
      </CardContent>
    </Card>
  );
}
