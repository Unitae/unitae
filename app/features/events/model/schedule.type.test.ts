import { describe, expect, it } from 'vitest'
import { ScheduleStatus, scheduleStatusFor } from './schedule.type'

describe('scheduleStatusFor', () => {
  it('publishes the schedules of a released event and keeps the others drafts', () => {
    expect(scheduleStatusFor('released')).toBe(ScheduleStatus.Published)
    expect(scheduleStatusFor('draft')).toBe(ScheduleStatus.Draft)
  })
})
