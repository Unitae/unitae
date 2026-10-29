import { describe, expect, it } from 'vitest'
import {
  assigneeRuns,
  durationText,
  formatMeetingDate,
  frenchSpacing,
  leaderLayout,
  programmeUnits,
  topicRuns,
  trackLabel,
} from './programme-sheet'
import type { ProgrammeSheetEvent, ProgrammeSheetPart } from './programme-sheet.type'
import type { TextMeasurer } from './sheet-text'

const measurer: TextMeasurer = {
  width: (text, weight) => text.length * (weight === 'bold' ? 0.58 : 0.5),
  baseline: 0.935,
}

function part(overrides: Partial<ProgrammeSheetPart> = {}): ProgrammeSheetPart {
  return {
    id: 1,
    name: 'Discours',
    section: '',
    track: '',
    order: 1,
    topic: '',
    durationMin: null,
    assignee: { firstname: 'Josué', lastname: 'Lopes da Silva', anonymizedAt: null },
    assistant: null,
    externalSpeaker: null,
    ...overrides,
  }
}

describe('the programme lines', () => {
  it('keeps French punctuation off the start of a line', () => {
    expect(frenchSpacing('« Restez éveillés ? »')).toBe('« Restez éveillés ? »')
  })

  it('ties the duration to the topic’s last word', () => {
    const talk = part({ topic: '« Restez éveillés »', durationMin: 10 })

    expect(durationText(talk)).toBe(' 10 min')
    expect(topicRuns(talk)).toEqual([{ text: '« Restez éveillés » 10 min', weight: 'regular' }])
  })

  it('prints the part’s name when it has no topic', () => {
    expect(topicRuns(part())[0].text).toBe('Discours')
  })

  it('prints both people of a part with an assistant', () => {
    const runs = assigneeRuns(part({ assistant: { firstname: 'Alain', lastname: 'Morel', anonymizedAt: null } }))

    expect(runs.map(run => run.text).join('')).toBe('Josué LOPES DA SILVA et Alain MOREL')
  })

  it('never prints the placeholder name an anonymized member keeps', () => {
    const runs = assigneeRuns(part({ assignee: { firstname: 'Ancien', lastname: 'Nom', anonymizedAt: new Date() } }))

    expect(runs.map(run => run.text).join('')).not.toContain('Ancien')
  })

  it('prints an external speaker as given, and a dash for nobody', () => {
    expect(assigneeRuns(part({ externalSpeaker: { name: 'Frère Olivier Lemaître' } }))[0].text).toBe(
      'Frère Olivier Lemaître',
    )
    expect(assigneeRuns(part({ assignee: null }))[0].text).toBe('—')
  })

  it('names an unnamed track by its room number', () => {
    expect(trackLabel(part({ track: '' }), 1)).toBe('Salle 2')
    expect(trackLabel(part({ track: 'Salle B' }), 1)).toBe('Salle B')
  })

  it('dates a meeting in the congregation’s timezone', () => {
    // 23:30 UTC on 6 October is already the 7th in Paris (UTC+2), 14:00 UTC already the 7th in Nouméa.
    expect(formatMeetingDate(new Date('2026-10-06T23:30:00Z'), 'Europe/Paris')).toBe('Mercredi 7 octobre')
    expect(formatMeetingDate(new Date('2026-10-06T14:00:00Z'), 'Pacific/Noumea')).toBe('Mercredi 7 octobre')
    expect(formatMeetingDate(new Date('2026-10-06T14:00:00Z'), 'Europe/Paris')).toBe('Mardi 6 octobre')
  })
})

describe('leaderLayout', () => {
  const who = [{ text: 'Luc RICHARD', weight: 'regular' as const }]

  it('keeps a part and its assignee on one line when they fit', () => {
    const layout = leaderLayout([{ text: 'Perles spirituelles', weight: 'regular' }], who, 500, measurer, 10)

    expect(layout.leftLines).toBeNull()
    expect(layout.leftEnd).toBe(95)
    expect(layout.rightStart).toBe(55)
  })

  it('wraps a long part in what the assignee leaves it, the leader on its last line', () => {
    const topic = [
      { text: '« Peut-on vraiment faire confiance à la Bible aujourd’hui ? » 30 min', weight: 'regular' as const },
    ]

    const layout = leaderLayout(topic, who, 300, measurer, 10)

    expect(layout.leftLines?.length).toBeGreaterThan(1)
    expect(layout.leftLines?.join(' ')).toBe(topic[0].text)
    expect(layout.leftEnd).toBeLessThan(layout.leftBox ?? 0)
  })
})

describe('programmeUnits', () => {
  const event = (templateId: number, day: number, name: string): ProgrammeSheetEvent => ({
    name,
    startDate: new Date(`2026-10-${String(day).padStart(2, '0')}T19:00:00Z`),
    templateId,
    template: { name },
    eventParts: [],
    eventServiceParts: [{ name: 'Accueil', assignee: null }],
  })

  it('opens each template’s first meeting with its name when grouping by template', () => {
    const units = programmeUnits(
      [event(2, 4, 'Réunion publique'), event(1, 7, 'Vie et ministère'), event(2, 11, 'Réunion publique')],
      new Map(),
      'template',
    )

    expect(units.map(unit => unit.templateHeading)).toEqual(['Réunion publique', null, 'Vie et ministère'])
  })

  it('leaves out the services a template does not print', () => {
    const [unit] = programmeUnits(
      [event(1, 7, 'Vie et ministère')],
      new Map([[1, { parts: true, services: false }]]),
      'date',
    )

    expect(unit.services).toEqual([])
  })
})
