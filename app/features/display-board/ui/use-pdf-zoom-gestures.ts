import { useEffect, useRef } from 'react'

import { createZoomGestureController } from './pdf-zoom-gesture-controller'

interface ZoomGestureOptions {
  scrollRef: React.RefObject<HTMLDivElement | null>
  /** The element carrying the rendered pages — receives the live preview transform. */
  contentRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  onCommit: (zoom: number) => void
}

/**
 * Pinch (touch) and ctrl+wheel (trackpad pinch) zoom for the PDF viewer.
 *
 * Re-rendering pdf.js pages continuously during a gesture is far too slow, so
 * the gesture only scales the already-rendered pages with a CSS transform as
 * a live preview; the real zoom commits when the gesture ends (or the wheel
 * goes idle) and the pages re-render crisply at the new scale. The preview
 * transform is cleared by the render effect once the sharp pages land.
 *
 * The state machine lives in createZoomGestureController (unit-tested); this
 * hook only binds it to DOM events and the preview transform. The scroller
 * needs `touch-action: pan-x pan-y` so the browser keeps one-finger panning
 * but hands two-finger pinches to these pointer handlers.
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

    const controller = createZoomGestureController({
      getZoom: () => zoomRef.current,
      setPreview: scaleFactor => {
        if (scaleFactor == null) {
          content.style.transform = ''
        } else {
          content.style.transformOrigin = 'top center'
          content.style.transform = `scale(${scaleFactor})`
        }
      },
      commit: nextZoom => onCommitRef.current(nextZoom),
    })

    const onPointerDown = (event: PointerEvent) =>
      controller.pointerDown(event.pointerId, event.clientX, event.clientY, event.pointerType === 'touch')
    const onPointerMove = (event: PointerEvent) => {
      if (controller.pointerMove(event.pointerId, event.clientX, event.clientY)) event.preventDefault()
    }
    const onPointerEnd = (event: PointerEvent) => controller.pointerEnd(event.pointerId)
    // Trackpad pinches arrive as wheel events with ctrlKey set.
    const onWheel = (event: WheelEvent) => {
      if (controller.wheel(event.deltaY, event.ctrlKey)) event.preventDefault()
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
      // Cancels any pending wheel commit and clears a live preview, so an
      // unmount or document switch mid-gesture cannot leave a stale
      // transform behind.
      controller.dispose()
    }
  }, [scrollRef, contentRef])
}
