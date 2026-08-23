import { clampUserZoom, pinchZoomFactor, wheelZoomFactor } from './pdf-viewer-scaling'

export const WHEEL_COMMIT_DELAY_MS = 180

export interface ZoomGestureHost {
  getZoom(): number
  /**
   * Live preview of the in-flight gesture: the CSS scale factor relative to
   * the zoom at gesture start (`null` clears the preview). Kept as a factor
   * because that is exactly what a `transform: scale()` needs.
   */
  setPreview(scaleFactor: number | null): void
  /** The gesture ended on a new zoom — re-render sharply at this level. */
  commit(zoom: number): void
}

/**
 * DOM-free core of the PDF zoom gestures (pinch and ctrl+wheel), so the
 * commit/preview state machine is unit-testable. The React hook binds it to
 * pointer/wheel events and owns the actual transform styling.
 */
export function createZoomGestureController(host: ZoomGestureHost) {
  const pointers = new Map<number, { x: number; y: number }>()
  let pinchStartDistance = 0
  let gestureStartZoom = 1
  let previewZoom: number | null = null
  let wheelTimer: ReturnType<typeof setTimeout> | null = null

  const distance = () => {
    const [a, b] = [...pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  const applyPreview = (nextZoom: number) => {
    previewZoom = nextZoom
    host.setPreview(nextZoom / gestureStartZoom)
  }

  const commitPreview = () => {
    if (previewZoom == null) return
    const target = previewZoom
    previewZoom = null
    if (target !== host.getZoom()) host.commit(target)
    else host.setPreview(null)
  }

  return {
    pointerDown(pointerId: number, x: number, y: number, isTouch: boolean): void {
      if (!isTouch) return
      pointers.set(pointerId, { x, y })
      if (pointers.size === 2) {
        pinchStartDistance = distance()
        gestureStartZoom = host.getZoom()
      }
    },

    /** Returns true when the move belongs to an active pinch (caller should preventDefault). */
    pointerMove(pointerId: number, x: number, y: number): boolean {
      if (!pointers.has(pointerId)) return false
      pointers.set(pointerId, { x, y })
      if (pointers.size !== 2 || pinchStartDistance <= 0) return false
      applyPreview(clampUserZoom(gestureStartZoom * pinchZoomFactor(pinchStartDistance, distance())))
      return true
    },

    pointerEnd(pointerId: number): void {
      if (!pointers.delete(pointerId)) return
      if (pointers.size < 2) {
        pinchStartDistance = 0
        commitPreview()
      }
    },

    /** Returns true when the event was a zoom gesture (caller should preventDefault). */
    wheel(deltaY: number, ctrlKey: boolean): boolean {
      if (!ctrlKey) return false
      if (previewZoom == null) gestureStartZoom = host.getZoom()
      const current = previewZoom ?? host.getZoom()
      applyPreview(clampUserZoom(current * wheelZoomFactor(deltaY)))
      if (wheelTimer) clearTimeout(wheelTimer)
      wheelTimer = setTimeout(commitPreview, WHEEL_COMMIT_DELAY_MS)
      return true
    },

    /** Cancel anything in flight — pending wheel commit, live preview. */
    dispose(): void {
      if (wheelTimer) clearTimeout(wheelTimer)
      wheelTimer = null
      pointers.clear()
      pinchStartDistance = 0
      if (previewZoom != null) {
        previewZoom = null
        host.setPreview(null)
      }
    },
  }
}
