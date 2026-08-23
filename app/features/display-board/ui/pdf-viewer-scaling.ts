export const ZOOM_STEP = 1.25
export const MIN_USER_ZOOM = 0.25
export const MAX_USER_ZOOM = 4
export const MAX_AUTO_FIT_SCALE = 3

export interface ViewportSize {
  width: number
  height: number
}

export interface PageSize {
  width: number
  height: number
}

export function computeAutoFitScale(page: PageSize, viewport: ViewportSize, isMobile: boolean): number {
  if (page.width <= 0 || page.height <= 0) return 1
  const widthRatio = viewport.width / page.width
  if (isMobile) return widthRatio

  const heightRatio = viewport.height / page.height
  return Math.min(widthRatio, heightRatio, MAX_AUTO_FIT_SCALE)
}

export function clampUserZoom(zoom: number): number {
  return Math.min(Math.max(zoom, MIN_USER_ZOOM), MAX_USER_ZOOM)
}

export const MAX_RENDER_PIXEL_RATIO = 3
export const MAX_CANVAS_DIMENSION = 8192
// Safari silently blanks canvases past ~16.7 megapixels; stay under it.
export const MAX_CANVAS_AREA = 4096 * 4096

/**
 * Backing-store ratio for a page canvas. Rendering at the device pixel ratio
 * is what keeps fit-width text crisp on high-density screens; the ratio backs
 * off when `cssScale x ratio` would push the canvas past MAX_CANVAS_DIMENSION
 * on a side or MAX_CANVAS_AREA overall (browsers silently blank oversized
 * canvases — the document reads as "glitching" at high zoom).
 */
export function computeRenderPixelRatio(devicePixelRatio: number, cssScale: number, page: PageSize): number {
  const base = Number.isFinite(devicePixelRatio) && devicePixelRatio > 1 ? devicePixelRatio : 1
  let ratio = Math.min(base, MAX_RENDER_PIXEL_RATIO)
  const maxPageDimension = Math.max(page.width, page.height)
  const pageArea = page.width * page.height
  if (cssScale > 0 && maxPageDimension > 0) {
    ratio = Math.min(ratio, MAX_CANVAS_DIMENSION / (cssScale * maxPageDimension))
  }
  if (cssScale > 0 && pageArea > 0) {
    ratio = Math.min(ratio, Math.sqrt(MAX_CANVAS_AREA / (cssScale * cssScale * pageArea)))
  }
  return Math.max(ratio, Number.MIN_VALUE)
}

/** Zoom factor of an in-progress pinch, from the two-finger distances. */
export function pinchZoomFactor(startDistance: number, currentDistance: number): number {
  if (!(startDistance > 0) || !(currentDistance > 0)) return 1
  return currentDistance / startDistance
}

const WHEEL_ZOOM_SENSITIVITY = 0.005
const WHEEL_ZOOM_MAX_STEP = Math.log(1.5)

/**
 * Zoom factor of one ctrl+wheel (trackpad pinch) event. Exponential so equal
 * and opposite deltas cancel; a single event is bounded to a gentle step.
 */
export function wheelZoomFactor(deltaY: number): number {
  const exponent = Math.min(Math.max(-deltaY * WHEEL_ZOOM_SENSITIVITY, -WHEEL_ZOOM_MAX_STEP), WHEEL_ZOOM_MAX_STEP)
  return Math.exp(exponent)
}
