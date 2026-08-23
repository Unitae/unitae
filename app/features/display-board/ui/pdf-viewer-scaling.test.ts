import { describe, expect, it } from 'vitest'
import {
  clampUserZoom,
  computeAutoFitScale,
  computeRenderPixelRatio,
  MAX_AUTO_FIT_SCALE,
  MAX_CANVAS_DIMENSION,
  MAX_USER_ZOOM,
  MIN_USER_ZOOM,
  pinchZoomFactor,
  wheelZoomFactor,
} from './pdf-viewer-scaling'

describe('computeAutoFitScale', () => {
  const desktopViewport = { width: 768, height: 800 }
  const mobileViewport = { width: 360, height: 640 }

  describe('on desktop', () => {
    it('fits portrait pages entirely inside the viewport (height-driven on tall pages)', () => {
      const portraitA4 = { width: 595, height: 842 }
      const wideViewport = { width: 1200, height: 900 }
      const scale = computeAutoFitScale(portraitA4, wideViewport, false)
      expect(scale).toBeCloseTo(wideViewport.height / portraitA4.height)
      expect(scale).toBeLessThan(wideViewport.width / portraitA4.width)
    })

    it('fits landscape pages entirely inside the viewport without overflowing the width', () => {
      const landscapeA4 = { width: 842, height: 595 }
      const wideViewport = { width: 1700, height: 900 }
      const scale = computeAutoFitScale(landscapeA4, wideViewport, false)
      expect(scale).toBeCloseTo(wideViewport.height / landscapeA4.height)
      expect(scale).toBeLessThan(wideViewport.width / landscapeA4.width)
    })

    it('falls back to width-fit when the viewport is narrower than the page proportionally', () => {
      const landscapeA4 = { width: 842, height: 595 }
      const narrowViewport = { width: 600, height: 900 }
      const scale = computeAutoFitScale(landscapeA4, narrowViewport, false)
      expect(scale).toBeCloseTo(narrowViewport.width / landscapeA4.width)
    })

    it('clamps the scale at MAX_AUTO_FIT_SCALE for very small pages', () => {
      const tinyPage = { width: 100, height: 100 }
      const largeViewport = { width: 4000, height: 3000 }
      expect(computeAutoFitScale(tinyPage, largeViewport, false)).toBe(MAX_AUTO_FIT_SCALE)
    })
  })

  describe('on mobile', () => {
    it('always fits to width regardless of orientation', () => {
      const portrait = { width: 595, height: 842 }
      const landscape = { width: 842, height: 595 }
      expect(computeAutoFitScale(portrait, mobileViewport, true)).toBeCloseTo(mobileViewport.width / portrait.width)
      expect(computeAutoFitScale(landscape, mobileViewport, true)).toBeCloseTo(mobileViewport.width / landscape.width)
    })

    it('does not clamp to MAX_AUTO_FIT_SCALE since width-fit cannot blow up the layout', () => {
      const tinyPage = { width: 100, height: 100 }
      expect(computeAutoFitScale(tinyPage, mobileViewport, true)).toBe(mobileViewport.width / tinyPage.width)
    })
  })

  it('returns 1 for invalid page dimensions to avoid division by zero', () => {
    expect(computeAutoFitScale({ width: 0, height: 100 }, desktopViewport, false)).toBe(1)
    expect(computeAutoFitScale({ width: 100, height: 0 }, desktopViewport, false)).toBe(1)
    expect(computeAutoFitScale({ width: -1, height: 100 }, desktopViewport, true)).toBe(1)
  })
})

describe('clampUserZoom', () => {
  it('keeps values within range untouched', () => {
    expect(clampUserZoom(1)).toBe(1)
    expect(clampUserZoom(2)).toBe(2)
  })

  it('clamps below MIN_USER_ZOOM up to MIN_USER_ZOOM', () => {
    expect(clampUserZoom(0)).toBe(MIN_USER_ZOOM)
    expect(clampUserZoom(-5)).toBe(MIN_USER_ZOOM)
  })

  it('clamps above MAX_USER_ZOOM down to MAX_USER_ZOOM', () => {
    expect(clampUserZoom(99)).toBe(MAX_USER_ZOOM)
  })
})

describe('computeRenderPixelRatio', () => {
  it('uses the device ratio up to the cap', () => {
    expect(computeRenderPixelRatio(1, 1, { width: 612, height: 792 })).toBe(1)
    expect(computeRenderPixelRatio(2, 1, { width: 612, height: 792 })).toBe(2)
    expect(computeRenderPixelRatio(5, 1, { width: 612, height: 792 })).toBe(3)
  })

  it('never drops below 1 and guards invalid input', () => {
    expect(computeRenderPixelRatio(0, 1, { width: 612, height: 792 })).toBe(1)
    expect(computeRenderPixelRatio(Number.NaN, 1, { width: 612, height: 792 })).toBe(1)
  })

  it('backs off so the canvas stays under the dimension cap at extreme zoom', () => {
    // 792pt page at css scale 12 would be 9504px; a 2x ratio would double it.
    const ratio = computeRenderPixelRatio(2, 12, { width: 612, height: 792 })
    expect(12 * ratio * 792).toBeLessThanOrEqual(MAX_CANVAS_DIMENSION)
    expect(ratio).toBeGreaterThan(0)
  })
})

describe('pinchZoomFactor', () => {
  it('is the ratio of finger distances', () => {
    expect(pinchZoomFactor(100, 200)).toBe(2)
    expect(pinchZoomFactor(200, 100)).toBe(0.5)
  })

  it('guards degenerate distances', () => {
    expect(pinchZoomFactor(0, 150)).toBe(1)
    expect(pinchZoomFactor(150, 0)).toBe(1)
  })
})

describe('wheelZoomFactor', () => {
  it('zooms in on negative delta and out on positive, symmetrically', () => {
    const zoomIn = wheelZoomFactor(-100)
    const zoomOut = wheelZoomFactor(100)
    expect(zoomIn).toBeGreaterThan(1)
    expect(zoomOut).toBeLessThan(1)
    expect(zoomIn * zoomOut).toBeCloseTo(1, 10)
  })

  it('bounds a single wheel event to a gentle step', () => {
    expect(wheelZoomFactor(-10000)).toBeLessThanOrEqual(1.5)
    expect(wheelZoomFactor(10000)).toBeGreaterThanOrEqual(1 / 1.5)
  })
})
