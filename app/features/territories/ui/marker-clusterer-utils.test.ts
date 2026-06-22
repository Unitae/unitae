import { describe, expect, it } from 'vitest'
import { createCoalescedRenderer } from './marker-clusterer-utils'

describe('createCoalescedRenderer', () => {
  it('coalesces many synchronous schedules into a single render', async () => {
    let renderCalls = 0
    const schedule = createCoalescedRenderer(() => ({
      render: () => {
        renderCalls++
      },
    }))

    for (let i = 0; i < 1500; i++) schedule()
    expect(renderCalls).toBe(0)

    await Promise.resolve()
    expect(renderCalls).toBe(1)
  })

  it('schedules a fresh render after the previous one flushed', async () => {
    let renderCalls = 0
    const schedule = createCoalescedRenderer(() => ({
      render: () => {
        renderCalls++
      },
    }))

    schedule()
    await Promise.resolve()
    schedule()
    await Promise.resolve()

    expect(renderCalls).toBe(2)
  })

  it('no-ops when the clusterer accessor returns null', async () => {
    let renderCalls = 0
    const schedule = createCoalescedRenderer(() => null)

    schedule()
    await Promise.resolve()

    expect(renderCalls).toBe(0)
  })
})
