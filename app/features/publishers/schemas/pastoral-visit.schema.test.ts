import { parseWithZod } from '@conform-to/zod/v4'
import { describe, expect, it, vi } from 'vitest'

vi.mock('~/i18n/paraglide/messages', () => ({ publishers_visit_error_date: () => 'date required' }))

const { pastoralVisitSchema } = await import('./pastoral-visit.schema')

function submit(fields: Record<string, string>) {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) formData.set(name, value)
  return parseWithZod(formData, { schema: pastoralVisitSchema })
}

describe('pastoralVisitSchema', () => {
  it('reads a visit date to save', () => {
    const submission = submit({ intent: 'save', visitedOn: '2026-10-20' })
    expect(submission.status === 'success' && submission.value).toEqual({ intent: 'save', visitedOn: '2026-10-20' })
  })

  it('reads a request to clear the date', () => {
    const submission = submit({ intent: 'clear' })
    expect(submission.status === 'success' && submission.value).toEqual({ intent: 'clear' })
  })

  it('asks for a date to save', () => {
    const submission = submit({ intent: 'save', visitedOn: '' })
    expect(submission.status === 'success' ? undefined : submission.error).toEqual({ visitedOn: ['date required'] })
  })

  // Only a crafted request sends these: 30 February would be stored as 2 March, 13/01 would fail.
  it.each(['2026-02-30', '2026-13-01'])('refuses %s, a day that does not exist', visitedOn => {
    const submission = submit({ intent: 'save', visitedOn })
    expect(submission.status === 'success' ? undefined : submission.error).toEqual({ visitedOn: ['date required'] })
  })
})
