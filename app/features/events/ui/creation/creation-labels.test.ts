import { describe, expect, it } from 'vitest'
import type { SeriesCount } from '~/features/events/model/programme-creation'
import * as m from '~/i18n/paraglide/messages'
import { meetingsCount, restLabel, submitLabel } from './creation-labels'

const count = (over: Partial<SeriesCount>): SeriesCount => ({
  create: 0,
  fill: 0,
  existing: 0,
  skipped: 0,
  schedules: 0,
  ...over,
})

describe('submitLabel, what the series button does (the user’s choice)', () => {
  it.each([
    [count({ create: 9, fill: 7 }), m.programs_new_submit_both({ create: 9, fill: 7 })],
    [count({ create: 16 }), m.programs_new_submit({ count: 16 })],
    [count({ fill: 7 }), m.programs_new_submit_fill({ count: 7 })],
    [count({ existing: 3, skipped: 1 }), m.programs_new_count_none()],
  ])('%o', (series, label) => {
    expect(submitLabel(series)).toBe(label)
  })
})

describe('meetingsCount and restLabel, the head of « Ce qui sera créé »', () => {
  it('counts new and filled meetings together, with their schedules', () => {
    expect(meetingsCount(count({ create: 9, fill: 7, schedules: 32 }))).toBe(
      `${m.programs_new_count({ count: 16 })} · ${m.programs_new_schedules({ count: 32 })}`,
    )
    expect(meetingsCount(count({ create: 2 }))).toBe(m.programs_new_count({ count: 2 }))
    expect(meetingsCount(count({ existing: 4 }))).toBe(m.programs_new_count_none())
  })

  it('separates the new from the meetings created ahead, and says what exists or was passed', () => {
    expect(restLabel(count({ create: 9, fill: 7 }))).toBe(
      [m.programs_new_new({ count: 9 }), m.programs_new_fill({ count: 7 })].join(' · '),
    )
    expect(restLabel(count({ fill: 7, existing: 1 }))).toBe(
      [m.programs_new_fill({ count: 7 }), m.programs_new_existing({ count: 1 })].join(' · '),
    )
    expect(restLabel(count({ create: 5 }))).toBe(m.programs_new_all_new())
  })
})
