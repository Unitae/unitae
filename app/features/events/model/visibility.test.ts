import { describe, expect, it } from 'vitest'
import { EventStatus } from './event-status.type'
import { ScheduleStatus } from './schedule.type'
import { eventIsVisible } from './visibility'

const published = { status: ScheduleStatus.Published }
const draft = { status: ScheduleStatus.Draft }

describe('eventIsVisible (D46)', () => {
  it('shows an event through any of its published schedules', () => {
    expect(eventIsVisible({ status: EventStatus.Draft, schedules: [draft, published] })).toBe(true)
  })

  it('hides an event whose schedules are all drafts', () => {
    expect(eventIsVisible({ status: EventStatus.Released, schedules: [draft, draft] })).toBe(false)
  })

  it('shows an event with no schedule at all while it is released, and hides it as a draft', () => {
    expect(eventIsVisible({ status: EventStatus.Released, schedules: [] })).toBe(true)
    expect(eventIsVisible({ status: EventStatus.Draft, schedules: [] })).toBe(false)
  })
})
