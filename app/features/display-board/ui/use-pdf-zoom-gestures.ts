import { useEffect, useRef } from 'react'

import { clampUserZoom, pinchZoomFactor, wheelZoomFactor } from './pdf-viewer-scaling'

interface ZoomGestureOptions {
  scrollRef: React.RefObject<HTMLDivElement | null>
  /** The element carrying the rendered pages — receives the live preview transform. */
  contentRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  onCommit: (zoom: number) => void
}

const WHEEL_COMMIT_DELAY_MS = 180

/**
 * Pinch (touch) and ctrl+wheel (trackpad pinch) zoom for the PDF viewer.
 *
 * Re-rendering pdf.js pages continuously during a gesture is far too slow, so
 * the gesture only scales the already-rendered pages with a CSS transform as
 * a live preview; the real zoom commits when the gesture ends (or the wheel
 * goes idle) and the pages re-render crisply at the new scale. The preview
 * transform is cleared by the render effect once the sharp pages land.
 *
 * The scroller needs `touch-action: pan-x pan-y` so the browser keeps
 * one-finger panning but hands two-finger pinches to these pointer handlers.
 */
export function usePdfZoomGestures({ scrollRef, contentRef, zoom, onCommit }: ZoomGestureOptions) {
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit

  useEffect(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content) return

    const pointers = new Map<number, { x: number; y: number }>()
    let pinchStartDistance = 0
    let pinchStartZoom = 1
    let previewZoom: number | null = null
    let wheelTimer: ReturnType<typeof setTimeout> | null = null

    const distance = () => {
      const [a, b] = [...pointers.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }

    const applyPreview = (nextZoom: number) => {
      previewZoom = nextZoom
      content.style.transformOrigin = 'top center'
      content.style.transform = `scale(${nextZoom / pinchStartZoom})`
    }

    const commitPreview = () => {
      if (previewZoom == null) return
      const target = previewZoom
      previewZoom = null
      if (target !== zoomRef.current) onCommitRef.current(target)
      else content.style.transform = ''
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size === 2) {
        pinchStartDistance = distance()
        pinchStartZoom = zoomRef.current
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size !== 2 || pinchStartDistance <= 0) return
      event.preventDefault()
      applyPreview(clampUserZoom(pinchStartZoom * pinchZoomFactor(pinchStartDistance, distance())))
    }

    const onPointerEnd = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) return
      if (pointers.size < 2) {
        pinchStartDistance = 0
        commitPreview()
      }
    }

    // Trackpad pinches arrive as wheel events with ctrlKey set.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      if (previewZoom == null) pinchStartZoom = zoomRef.current
      const current = previewZoom ?? zoomRef.current
      applyPreview(clampUserZoom(current * wheelZoomFactor(event.deltaY)))
      if (wheelTimer) clearTimeout(wheelTimer)
      wheelTimer = setTimeout(commitPreview, WHEEL_COMMIT_DELAY_MS)
    }

    scroller.addEventListener('pointerdown', onPointerDown)
    scroller.addEventListener('pointermove', onPointerMove)
    scroller.addEventListener('pointerup', onPointerEnd)
    scroller.addEventListener('pointercancel', onPointerEnd)
    scroller.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      scroller.removeEventListener('pointerdown', onPointerDown)
      scroller.removeEventListener('pointermove', onPointerMove)
      scroller.removeEventListener('pointerup', onPointerEnd)
      scroller.removeEventListener('pointercancel', onPointerEnd)
      scroller.removeEventListener('wheel', onWheel)
      if (wheelTimer) clearTimeout(wheelTimer)
    }
  }, [scrollRef, contentRef])
}
