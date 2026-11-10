import { describe, expect, it } from 'vitest'
import { programmeCreationSchema } from './program-new.schema'

const schema = programmeCreationSchema('2026-11-10')

function issues(input: Record<string, unknown>): Record<string, string> {
  const result = schema.safeParse(input)
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map(issue => [issue.path.join('.'), issue.message]))
}

describe('programmeCreationSchema', () => {
  it('reads a series, one template id or several, and the days to skip', () => {
    expect(schema.parse({ mode: 'series', templateIds: '270', from: '2026-12-28', to: '2027-02-28' })).toEqual({
      mode: 'series',
      templateIds: [270],
      from: '2026-12-28',
      to: '2027-02-28',
      skip: [],
    })
    expect(
      schema.parse({
        mode: 'series',
        templateIds: ['270', '271'],
        from: '2026-12-28',
        to: '2027-02-28',
        skip: '271:2027-02-21',
      }),
    ).toMatchObject({ templateIds: [270, 271], skip: ['271:2027-02-21'] })
  })

  it('wants at least one meeting in a series', () => {
    expect(Object.keys(issues({ mode: 'series', from: '2026-12-28', to: '2027-02-28' }))).toEqual(['templateIds'])
  })

  it('refuses a series that ends before it starts, or lasts more than a year', () => {
    expect(Object.keys(issues({ mode: 'series', templateIds: '270', from: '2026-12-28', to: '2026-12-01' }))).toEqual([
      'to',
    ])
    expect(Object.keys(issues({ mode: 'series', templateIds: '270', from: '2026-12-28', to: '2027-12-28' }))).toEqual([
      'to',
    ])
    expect(issues({ mode: 'series', templateIds: '270', from: '2026-12-28', to: '2027-12-27' })).toEqual({})
  })

  it('refuses a day that is not one, or that has passed', () => {
    expect(Object.keys(issues({ mode: 'single', templateId: '272', day: '2026-02-30' }))).toEqual(['day'])
    expect(Object.keys(issues({ mode: 'single', templateId: '272', day: '2026-11-09' }))).toEqual(['day'])
    expect(issues({ mode: 'single', templateId: '272', day: '2026-11-10' })).toEqual({})
  })

  it('wants a name and an end after the start for another event', () => {
    expect(
      Object.keys(issues({ mode: 'freeform', name: '  ', day: '2027-01-16', startTime: '09:00', endTime: '12:00' })),
    ).toEqual(['name'])
    expect(
      Object.keys(
        issues({ mode: 'freeform', name: 'Nettoyage', day: '2027-01-16', startTime: '09:00', endTime: '08:30' }),
      ),
    ).toEqual(['endTime'])
    expect(
      schema.parse({ mode: 'freeform', name: ' Nettoyage ', day: '2027-01-16', startTime: '09:00', endTime: '12:00' }),
    ).toMatchObject({ name: 'Nettoyage' })
  })
})
