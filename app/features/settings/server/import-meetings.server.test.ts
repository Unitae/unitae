import { describe, expect, it, vi } from 'vitest'

const calls: string[] = []
const step = (name: string) => vi.fn(async () => calls.push(name))

vi.mock('./import-absences.server', () => ({ importAbsences: step('absences') }))
vi.mock('./import-attendance.server', () => ({ importAttendance: step('attendance') }))
vi.mock('./import-event-templates.server', () => ({
  importEventTemplates: step('templates'),
  importTemplateParts: step('template parts'),
  importTemplatePartAllowedRoles: step('template part roles'),
  importTemplateServiceParts: step('template services'),
  importTemplateServicePartAllowedRoles: step('template service roles'),
  importTemplateResponsibles: step('template responsibles'),
}))
vi.mock('./import-events.server', () => ({
  importEvents: vi.fn(async () => {
    calls.push('events')
    return []
  }),
  importEventParts: step('event parts'),
  importEventPartAllowedRoles: step('event part roles'),
  importEventServiceParts: step('event services'),
  settleImportedEventOrigins: step('origins'),
  importEventServicePartAllowedRoles: step('event service roles'),
}))
vi.mock('./import-part-presets.server', () => ({ importPartPresets: step('presets') }))
vi.mock('./import-schedules.server', () => ({ importSchedules: step('schedules') }))

const { importMeetings } = await import('./import-meetings.server')

describe('importMeetings', () => {
  it('imports the meeting entities in dependency order, schedules last, reporting progress after each step', async () => {
    const progress = vi.fn(async () => {
      calls.push('·')
    })

    await importMeetings({} as never, {} as never, {} as never, 1, progress)

    expect(calls.join(' ')).toBe(
      [
        'presets ·',
        'templates ·',
        'template parts ·',
        'template part roles ·',
        'template services ·',
        'template service roles ·',
        'template responsibles ·',
        'events absences attendance ·',
        'event parts ·',
        'event part roles ·',
        'event services origins ·',
        'event service roles ·',
        'schedules ·',
      ].join(' '),
    )
  })
})
