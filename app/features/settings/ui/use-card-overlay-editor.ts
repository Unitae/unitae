import { useEffect, useRef, useState } from 'react'
import { useNavigation } from 'react-router'
import { buildGeoJsonExport, type CardOverlay, type CardOverlayPath } from '~/features/territories'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'

const DEFAULT_OVERLAY_COLOR = '#C2175B'
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

export function computeInitialCenter(
  perimeterMode: PerimeterMode,
  perimeter: { paths: CardOverlayPath[] } | null,
  editingOverlay: CardOverlay | null,
  overlays: CardOverlay[],
): { lat: number; lng: number } | undefined {
  if (perimeterMode === 'edit' && perimeter?.paths[0] != null) {
    return { lat: perimeter.paths[0].lat, lng: perimeter.paths[0].lng }
  }
  if (editingOverlay?.paths[0] != null) {
    return { lat: editingOverlay.paths[0].lat, lng: editingOverlay.paths[0].lng }
  }
  if (perimeter?.paths[0] != null) {
    return { lat: perimeter.paths[0].lat, lng: perimeter.paths[0].lng }
  }
  if (overlays[0]?.paths[0] != null) {
    return { lat: overlays[0].paths[0].lat, lng: overlays[0].paths[0].lng }
  }
  return undefined
}

export function useCardOverlayEditor(overlays: CardOverlay[], perimeter: { paths: CardOverlayPath[] } | null) {
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
  const initialCenter = computeInitialCenter(perimeterMode, perimeter, editingOverlay, overlays)

  function markDraftDirty() {
    setDraftDirty(true)
    markDirty()
  }

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

  function handleDraftChange(paths: CardOverlayPath[]) {
    setDraftPaths(paths)
    markDraftDirty()
  }

  // After a successful create/update submit, exit draft mode so the freshly loaded row
  // shows up in the list rather than the stale local draft.
  const navigation = useNavigation()
  const wasSubmittingRef = useRef(false)
  useEffect(() => {
    const isSubmitting =
      navigation.state === 'submitting' &&
      navigation.formMethod === 'POST' &&
      navigation.formAction?.endsWith('/card-overlays')
    if (isSubmitting) {
      wasSubmittingRef.current = true
      return
    }
    if (wasSubmittingRef.current && navigation.state === 'idle') {
      wasSubmittingRef.current = false
      setIsDrawing(false)
      setEditingId(null)
      setPerimeterMode(null)
      setDraftPaths(null)
      setDraftName('')
      setDraftColor(DEFAULT_OVERLAY_COLOR)
      setDraftDirty(false)
    }
  }, [navigation.state, navigation.formMethod, navigation.formAction])

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
    initialCenter,
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
