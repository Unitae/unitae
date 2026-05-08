import { describe, expect, it } from 'vitest'
import {
  clampUserZoom,
  computeAutoFitScale,
  MAX_AUTO_FIT_SCALE,
  MAX_USER_ZOOM,
  MIN_USER_ZOOM,
} from './pdf-viewer-scaling'

describe('computeAutoFitScale', () => {
  const desktopViewport = { width: 768, height: 800 }
  const mobileViewport = { width: 360, height: 640 }

  describe('on desktop', () => {
    it('scales portrait pages to fit the viewport width (matches today)', () => {
      const portraitA4 = { width: 595, height: 842 }
      const scale = computeAutoFitScale(portraitA4, desktopViewport, false)
      expect(scale).toBeCloseTo(desktopViewport.width / portraitA4.width)
    })

    it('scales landscape pages to fit-to-page so the height is used without overflowing the width', () => {
      const landscapeA4 = { width: 842, height: 595 }
      const wideViewport = { width: 1700, height: 900 }
      const scale = computeAutoFitScale(landscapeA4, wideViewport, false)
      expect(scale).toBeCloseTo(wideViewport.height / landscapeA4.height)
      expect(scale).toBeLessThan(wideViewport.width / landscapeA4.width)
    })

    it('falls back to fit-to-width for landscape pages when the viewport is too narrow for fit-to-page', () => {
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
