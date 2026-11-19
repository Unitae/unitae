import { describe, expect, it } from 'vitest'
import { EventTemplateKey, isSystemTemplate } from './event-template.type'

describe('isSystemTemplate', () => {
  // Absences are rows of their own: the day-off key is no system template's.
  it('treats the day-off key as an ordinary one', () => {
    expect(isSystemTemplate(EventTemplateKey.DayOff)).toBe(false)
  })

  it('recognises the freeform template', () => {
    expect(isSystemTemplate(EventTemplateKey.Freeform)).toBe(true)
  })

  it('leaves meeting-style seeded templates editable', () => {
    expect(isSystemTemplate(EventTemplateKey.MidweekMeeting)).toBe(false)
    expect(isSystemTemplate(EventTemplateKey.WeekendMeeting)).toBe(false)
    expect(isSystemTemplate(EventTemplateKey.Memorial)).toBe(false)
  })

  it('leaves user-created keys editable', () => {
    expect(isSystemTemplate('assembly')).toBe(false)
    expect(isSystemTemplate('')).toBe(false)
  })
})
