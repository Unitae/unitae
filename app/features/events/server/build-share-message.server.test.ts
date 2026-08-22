import { describe, expect, it, vi } from 'vitest'
import { buildAssignmentShareText, buildShareTextsForEvent } from './build-share-message.server'

const EVENT = {
  name: 'Réunion de semaine',
  startDate: new Date('2026-09-03T17:30:00.000Z'), // 19:30 Europe/Paris
}

const PRESET = {
  key: 'custom-kind',
  shareMessage:
    'Bonjour {{assigneeFirstname}},\n\nTu as {{partName}} le {{date}} à {{time}}.\nSujet : {{topic}}\nDurée : {{duration}}\nAvec : {{assistant}}\n\n{{link}}',
}

function args(overrides: Record<string, unknown> = {}) {
  return {
    part: {
      name: 'Lecture de la Bible',
      section: 'Joyaux spirituels',
      topic: 'Proverbes 3',
      note: '',
      durationMin: 4,
      assignee: { firstname: 'Jean', lastname: 'Dupont' },
      assistant: null,
      externalSpeaker: null,
      preset: PRESET,
    },
    event: EVENT,
    link: '/board/dynamic/7/viewer?eventId=12',
    baseUrl: 'https://lyon.unitae.app',
    congregationName: 'Assemblée de Lyon',
    locale: 'fr',
    timezone: 'Europe/Paris',
    ...overrides,
  }
}

function withPart(patch: Record<string, unknown>) {
  return args({ part: { ...args().part, ...patch } })
}

describe('buildAssignmentShareText', () => {
  it('builds the message for an assigned part', () => {
    const text = buildAssignmentShareText(args())

    expect(text).toContain('Bonjour Jean,')
    expect(text).toContain('Tu as Lecture de la Bible')
  })

  it('makes the link absolute — a relative path is useless in an SMS', () => {
    const text = buildAssignmentShareText(args())

    expect(text).toContain('https://lyon.unitae.app/board/dynamic/7/viewer?eventId=12')
  })

  it('formats the date and time in the congregation timezone', () => {
    const text = buildAssignmentShareText(args())

    expect(text).toContain('19:30')
    expect(text).toContain('jeudi 3 septembre')
  })

  it('returns null when nobody is assigned — there is no one to message', () => {
    expect(buildAssignmentShareText(withPart({ assignee: null }))).toBeNull()
  })

  it('returns null when the part has no kind', () => {
    expect(buildAssignmentShareText(withPart({ preset: null }))).toBeNull()
  })

  it('returns null when the kind carries no message', () => {
    expect(buildAssignmentShareText(withPart({ preset: { key: 'custom-kind', shareMessage: '   ' } }))).toBeNull()
  })

  it('shares to an external speaker too — they are assigned like anyone else', () => {
    const text = buildAssignmentShareText(withPart({ assignee: null, externalSpeaker: { name: 'Pierre Martin' } }))

    expect(text).toContain('Pierre Martin')
  })

  it('drops the optional lines when the details are empty', () => {
    const text = buildAssignmentShareText(withPart({ topic: '', durationMin: null, assistant: null }))

    expect(text).not.toContain('Sujet :')
    expect(text).not.toContain('Durée :')
    expect(text).not.toContain('Avec :')
    // The core sentence survives.
    expect(text).toContain('Tu as Lecture de la Bible')
  })

  it('returns null when every line renders away, not an empty string', () => {
    // A body whose only variable is empty renders to nothing. The caller tests
    // for null, so returning '' would work by accident rather than by contract.
    const text = buildAssignmentShareText(
      withPart({ assistant: null, preset: { key: 'custom-kind', shareMessage: 'Avec {{assistant}}' } }),
    )

    expect(text).toBeNull()
  })

  it('falls back to the full name when a member has no first name', () => {
    const text = buildAssignmentShareText(withPart({ assignee: { firstname: null, lastname: 'Dupont' } }))

    expect(text).toContain('Bonjour Dupont,')
  })

  it('treats a whitespace-only name as nobody', () => {
    expect(buildAssignmentShareText(withPart({ assignee: { firstname: '  ', lastname: '  ' } }))).toBeNull()
  })

  it('includes the assistant when there is one', () => {
    const text = buildAssignmentShareText(withPart({ assistant: { firstname: 'Marc', lastname: 'Petit' } }))

    expect(text).toContain('Marc Petit')
  })

  it('renders the duration with a unit rather than a bare number', () => {
    expect(buildAssignmentShareText(args())).toContain('4 min')
  })

  it('formats in English for an English congregation', () => {
    const text = buildAssignmentShareText(args({ locale: 'en' }))

    expect(text).toContain('September')
  })
})

describe('buildShareTextsForEvent', () => {
  const congregation = {
    baseUrl: 'https://lyon.unitae.app',
    displayName: 'Assemblée de Lyon',
    locale: 'fr',
    timezone: 'Europe/Paris',
  }

  function eventWith(parts: unknown[]) {
    return { id: 12, templateId: 3, name: 'Réunion de semaine', startDate: EVENT.startDate, eventParts: parts }
  }

  function part(id: number, patch: Record<string, unknown> = {}) {
    return { ...args().part, id, ...patch }
  }

  it('keys the messages by part id', async () => {
    const resolveLink = vi.fn().mockResolvedValue('/board')

    const texts = await buildShareTextsForEvent(eventWith([part(7)]) as never, congregation, resolveLink)

    expect(Object.keys(texts)).toEqual(['7'])
  })

  it('resolves the programme link once for the whole event, not once per part', async () => {
    // One database round trip regardless of how many parts the event has.
    const resolveLink = vi.fn().mockResolvedValue('/board')

    await buildShareTextsForEvent(eventWith([part(1), part(2), part(3)]) as never, congregation, resolveLink)

    expect(resolveLink).toHaveBeenCalledTimes(1)
  })

  it('handles an event with no parts', async () => {
    const resolveLink = vi.fn().mockResolvedValue('/board')

    expect(await buildShareTextsForEvent(eventWith([]) as never, congregation, resolveLink)).toEqual({})
  })

  it('omits parts with nothing to send instead of storing an empty string', async () => {
    const resolveLink = vi.fn().mockResolvedValue('/board')

    const texts = await buildShareTextsForEvent(
      eventWith([part(1), part(2, { assignee: null }), part(3, { preset: null })]) as never,
      congregation,
      resolveLink,
    )

    expect(Object.keys(texts)).toEqual(['1'])
  })
})
