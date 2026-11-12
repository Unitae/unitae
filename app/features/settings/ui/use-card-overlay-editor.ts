import { useCallback, useEffect, useRef, useState } from 'react'
import type { MapFetcher } from '~/features/settings/ui/map-fetcher'
import { buildGeoJsonExport, type CardOverlay, type CardOverlayPath } from '~/features/territories'
import { DEFAULT_SWATCH } from '~/shared/ui/ColorSwatches'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'

const DEFAULT_OVERLAY_COLOR = DEFAULT_SWATCH
export const PERIMETER_DRAFT_COLOR = '#6B7280'

export function downloadCardOverlaysGeoJson(overlays: CardOverlay[], perimeter: { paths: CardOverlayPath[] } | null) {
  const collection = buildGeoJsonExport(overlays, perimeter?.paths ?? null)
  const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'unitae-territory-card-overlays.geojson'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export type PerimeterMode = 'new' | 'edit' | null

export function useCardOverlayEditor(
  overlays: CardOverlay[],
  perimeter: { paths: CardOverlayPath[] } | null,
  /** The fetcher the draft is saved with: the draft closes once it reports the save went through, never before. */
  draft: MapFetcher,
) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [perimeterMode, setPerimeterMode] = useState<PerimeterMode>(null)
  const [draftPaths, setDraftPaths] = useState<CardOverlayPath[] | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftColor, setDraftColor] = useState(DEFAULT_OVERLAY_COLOR)
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)
  const [draftDirty, setDraftDirty] = useState(false)
  const { blocker, markDirty } = useUnsavedChanges()

  const editingOverlay = editingId == null ? null : (overlays.find(o => o.id === editingId) ?? null)
  const isDraftActive = isDrawing || editingId != null || perimeterMode != null
  const editingPerimeter = perimeterMode != null
  // Stable identity — handleDraftChange depends on it, and that identity feeds a useEffect
  // dep list in CardOverlayMap; a fresh function per render would churn that effect.
  const markDraftDirty = useCallback(() => {
    setDraftDirty(true)
    markDirty()
  }, [markDirty])

  function startDrawing() {
    setEditingId(null)
    setPerimeterMode(null)
    setDraftPaths(null)
    setDraftName('')
    setDraftColor(DEFAULT_OVERLAY_COLOR)
    setDraftDirty(false)
    setIsDrawing(true)
  }

  function startEditing(overlay: CardOverlay) {
    setEditingId(overlay.id)
    setIsDrawing(false)
    setPerimeterMode(null)
    setDraftPaths(overlay.paths)
    setDraftName(overlay.name ?? '')
    setDraftColor(overlay.color)
    setDraftDirty(false)
  }

  function startEditingPerimeter() {
    if (perimeter == null) return
    setEditingId(null)
    setIsDrawing(false)
    setPerimeterMode('edit')
    setDraftPaths(perimeter.paths)
    setDraftName('')
    setDraftColor(PERIMETER_DRAFT_COLOR)
    setDraftDirty(false)
  }

  function startNewPerimeter() {
    setEditingId(null)
    setIsDrawing(false)
    setPerimeterMode('new')
    setDraftPaths(null)
    setDraftName('')
    setDraftColor(PERIMETER_DRAFT_COLOR)
    setDraftDirty(false)
  }

  function exitDraftMode() {
    setIsDrawing(false)
    setEditingId(null)
    setPerimeterMode(null)
    setDraftPaths(null)
    setDraftName('')
    setDraftColor(DEFAULT_OVERLAY_COLOR)
    setDraftDirty(false)
  }

  function handleCancelClick() {
    if (draftDirty) {
      setConfirmCancelOpen(true)
      return
    }
    exitDraftMode()
  }

  // Stable identity — the Terra Draw effect in CardOverlayMap uses this in its dep list;
  // a fresh identity on every render would tear the drawing instance down mid-edit.
  const handleDraftChange = useCallback(
    (paths: CardOverlayPath[]) => {
      setDraftPaths(paths)
      markDraftDirty()
    },
    [markDraftDirty],
  )

  // After a save that went through, leave the draft so the saved zone shows in the list. A save that failed keeps the
  // drawing on the map and the form as it was, to try again.
  const wasSubmittingRef = useRef(false)
  useEffect(() => {
    if (draft.state === 'submitting') {
      wasSubmittingRef.current = true
      return
    }
    if (wasSubmittingRef.current && draft.state === 'idle') {
      wasSubmittingRef.current = false
      if ((draft.data as { ok?: boolean } | undefined)?.ok) {
        setIsDrawing(false)
        setEditingId(null)
        setPerimeterMode(null)
        setDraftPaths(null)
        setDraftName('')
        setDraftColor(DEFAULT_OVERLAY_COLOR)
        setDraftDirty(false)
      }
    }
  }, [draft.state, draft.data])

  return {
    editingId,
    isDrawing,
    perimeterMode,
    draftPaths,
    draftName,
    setDraftName,
    draftColor,
    setDraftColor,
    confirmCancelOpen,
    setConfirmCancelOpen,
    editingOverlay,
    isDraftActive,
    editingPerimeter,
    blocker,
    markDirty,
    markDraftDirty,
    startDrawing,
    startEditing,
    startEditingPerimeter,
    startNewPerimeter,
    exitDraftMode,
    handleCancelClick,
    handleDraftChange,
  }
}
