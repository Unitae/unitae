import { describe, expect, it } from 'vitest'
import { isSystemTemplate, ProgrammeTemplateKey } from './programme-template.type'

describe('isSystemTemplate', () => {
  it('recognises the day-off template', () => {
    expect(isSystemTemplate(ProgrammeTemplateKey.DayOff)).toBe(true)
  })

  it('recognises the freeform template', () => {
    expect(isSystemTemplate(ProgrammeTemplateKey.Freeform)).toBe(true)
  })

  it('leaves meeting-style seeded templates editable', () => {
    expect(isSystemTemplate(ProgrammeTemplateKey.MidweekMeeting)).toBe(false)
    expect(isSystemTemplate(ProgrammeTemplateKey.WeekendMeeting)).toBe(false)
    expect(isSystemTemplate(ProgrammeTemplateKey.Memorial)).toBe(false)
  })

  it('leaves user-created keys editable', () => {
    expect(isSystemTemplate('assembly')).toBe(false)
    expect(isSystemTemplate('')).toBe(false)
  })
})
