import { describe, expect, it } from 'vitest'

import { dayOffSchema } from './day-off.schema'

describe('dayOffSchema', () => {
  it('takes a one-day absence', () => {
    expect(dayOffSchema.safeParse({ first: '2026-11-28', last: '2026-11-28' }).success).toBe(true)
  })

  it('refuses a last day before the first, on the last day', () => {
    const result = dayOffSchema.safeParse({ first: '2026-11-28', last: '2026-11-27' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['last'])
  })

  it('refuses something that is not a day', () => {
    expect(dayOffSchema.safeParse({ first: 'demain', last: '2026-11-27' }).success).toBe(false)
  })
})
