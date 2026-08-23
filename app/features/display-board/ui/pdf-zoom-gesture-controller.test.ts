import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_USER_ZOOM } from './pdf-viewer-scaling'
import { createZoomGestureController, WHEEL_COMMIT_DELAY_MS } from './pdf-zoom-gesture-controller'

interface HostLog {
  zoom: number
  previews: Array<number | null>
  commits: number[]
}

function makeHost(zoom = 1) {
  const log: HostLog = { zoom, previews: [], commits: [] }
  const host = {
    getZoom: () => log.zoom,
    setPreview: (scale: number | null) => {
      log.previews.push(scale)
    },
    commit: (nextZoom: number) => {
      log.commits.push(nextZoom)
      log.zoom = nextZoom
    },
  }
  return { host, log }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('pinch', () => {
  it('previews while two touch pointers move and commits when one lifts', () => {
    const { host, log } = makeHost(1)
    const controller = createZoomGestureController(host)

    controller.pointerDown(1, 0, 0, true)
    controller.pointerDown(2, 100, 0, true)
    // Fingers spread from 100 to 200 apart -> 2x
    expect(controller.pointerMove(2, 200, 0)).toBe(true)
    expect(log.previews.at(-1)).toBe(2)

    controller.pointerEnd(2)
    expect(log.commits).toEqual([2])
  })

  it('clears the preview instead of committing when the pinch returns to its start', () => {
    const { host, log } = makeHost(1)
    const controller = createZoomGestureController(host)

    controller.pointerDown(1, 0, 0, true)
    controller.pointerDown(2, 100, 0, true)
    controller.pointerMove(2, 150, 0)
    controller.pointerMove(2, 100, 0) // back to the starting distance
    controller.pointerEnd(1)

    expect(log.commits).toEqual([])
    expect(log.previews.at(-1)).toBeNull()
  })

  it('clamps the committed zoom to the user range', () => {
    const { host, log } = makeHost(2)
    const controller = createZoomGestureController(host)

    controller.pointerDown(1, 0, 0, true)
    controller.pointerDown(2, 10, 0, true)
    controller.pointerMove(2, 1000, 0) // 100x spread
    controller.pointerEnd(2)

    expect(log.commits).toEqual([MAX_USER_ZOOM])
  })

  it('ignores non-touch pointers and third fingers', () => {
    const { host, log } = makeHost(1)
    const controller = createZoomGestureController(host)

    controller.pointerDown(1, 0, 0, false) // mouse
    controller.pointerDown(2, 100, 0, true)
    expect(controller.pointerMove(2, 200, 0)).toBe(false)

    controller.pointerDown(3, 50, 50, true)
    controller.pointerDown(4, 60, 60, true)
    controller.pointerDown(5, 70, 70, true) // three touch pointers now
    expect(controller.pointerMove(5, 300, 300)).toBe(false)
    expect(log.previews).toEqual([])
    expect(log.commits).toEqual([])
  })
})

describe('ctrl+wheel', () => {
  it('accumulates previews and commits once after the idle delay', () => {
    const { host, log } = makeHost(1)
    const controller = createZoomGestureController(host)

    expect(controller.wheel(-100, true)).toBe(true)
    expect(controller.wheel(-100, true)).toBe(true)
    expect(log.previews.length).toBe(2)
    expect(log.commits).toEqual([])

    vi.advanceTimersByTime(WHEEL_COMMIT_DELAY_MS)
    expect(log.commits.length).toBe(1)
    expect(log.commits[0]).toBeGreaterThan(1)
  })

  it('restarts the idle timer on every wheel event', () => {
    const { host, log } = makeHost(1)
    const controller = createZoomGestureController(host)

    controller.wheel(-100, true)
    vi.advanceTimersByTime(WHEEL_COMMIT_DELAY_MS - 50)
    controller.wheel(-100, true)
    vi.advanceTimersByTime(WHEEL_COMMIT_DELAY_MS - 50)
    expect(log.commits).toEqual([])

    vi.advanceTimersByTime(50)
    expect(log.commits.length).toBe(1)
  })

  it('ignores wheel events without ctrl', () => {
    const { host, log } = makeHost(1)
    const controller = createZoomGestureController(host)

    expect(controller.wheel(-100, false)).toBe(false)
    vi.advanceTimersByTime(WHEEL_COMMIT_DELAY_MS)
    expect(log.previews).toEqual([])
    expect(log.commits).toEqual([])
  })
})

describe('dispose', () => {
  it('cancels a pending wheel commit and clears the preview', () => {
    const { host, log } = makeHost(1)
    const controller = createZoomGestureController(host)

    controller.wheel(-100, true)
    controller.dispose()
    vi.advanceTimersByTime(WHEEL_COMMIT_DELAY_MS)

    expect(log.commits).toEqual([])
    expect(log.previews.at(-1)).toBeNull()
  })

  it('is a no-op when nothing is in flight', () => {
    const { host, log } = makeHost(1)
    const controller = createZoomGestureController(host)

    controller.dispose()
    expect(log.previews).toEqual([])
  })
})
