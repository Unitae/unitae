import { describe, expect, it } from 'vitest'
import { EventTemplateKey, isSystemTemplate } from './event-template.type'

describe('isSystemTemplate', () => {
  it('recognises the day-off template', () => {
    expect(isSystemTemplate(EventTemplateKey.DayOff)).toBe(true)
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
