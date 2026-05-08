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
  return Math.min(Math.max(widthRatio, heightRatio), MAX_AUTO_FIT_SCALE)
}

export function clampUserZoom(zoom: number): number {
  return Math.min(Math.max(zoom, MIN_USER_ZOOM), MAX_USER_ZOOM)
}
