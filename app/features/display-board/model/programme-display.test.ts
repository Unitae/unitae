import { describe, expect, it, vi } from 'vitest'

vi.mock('~/i18n/paraglide/messages', () => ({
  board_read_status_anonymized_user: () => 'Anonyme',
}))

const { formatName, formatAssigneeWithAssistant, nameMatches, getPartDisplay, partMatchesQuery } = await import(
  './programme-display'
)

function makeUser(firstname: string | null, lastname: string | null, anonymizedAt: Date | null = null) {
  return { firstname, lastname, anonymizedAt }
}

function makePart(overrides: {
  externalSpeaker?: { name: string } | null
  assignee?: ReturnType<typeof makeUser> | null
  assistant?: ReturnType<typeof makeUser> | null
}) {
  return {
    externalSpeaker: overrides.externalSpeaker ?? null,
    assignee: overrides.assignee ?? null,
    assistant: overrides.assistant ?? null,
  }
}

describe('formatName', () => {
  it('returns full name when both firstname and lastname are present', () => {
    expect(formatName(makeUser('Jean', 'Dupont'))).toBe('Jean Dupont')
  })

  it('returns the available part when one is missing', () => {
    expect(formatName(makeUser('Jean', null))).toBe('Jean')
    expect(formatName(makeUser(null, 'Dupont'))).toBe('Dupont')
  })

  it('returns null for null user', () => {
    expect(formatName(null)).toBeNull()
  })

  it('returns null when both name fields are empty', () => {
    expect(formatName(makeUser(null, null))).toBeNull()
  })

  it('returns the anonymized placeholder when the user is anonymized', () => {
    expect(formatName(makeUser('Jean', 'Dupont', new Date()))).toBe('Anonyme')
  })
})

describe('formatAssigneeWithAssistant', () => {
  it('joins assignee and assistant with a slash', () => {
    expect(formatAssigneeWithAssistant('Jean', 'Marie')).toBe('Jean / Marie')
  })

  it('returns assignee alone when no assistant', () => {
    expect(formatAssigneeWithAssistant('Jean', null)).toBe('Jean')
  })

  it('returns null when no assignee, regardless of assistant', () => {
    expect(formatAssigneeWithAssistant(null, 'Marie')).toBeNull()
    expect(formatAssigneeWithAssistant(null, null)).toBeNull()
  })
})

describe('nameMatches', () => {
  it('matches against the formatted name (caller is expected to lowercase the query)', () => {
    expect(nameMatches(makeUser('Jean', 'Dupont'), 'jean')).toBe(true)
    expect(nameMatches(makeUser('Jean', 'Dupont'), 'dupont')).toBe(true)
    expect(nameMatches(makeUser('Jean', 'Dupont'), 'paul')).toBe(false)
  })

  it('returns false for null user', () => {
    expect(nameMatches(null, 'jean')).toBe(false)
  })

  it('matches the anonymized placeholder', () => {
    expect(nameMatches(makeUser('Jean', 'Dupont', new Date()), 'anon')).toBe(true)
  })
})

describe('getPartDisplay', () => {
  it('returns the external speaker name with isExternal=true when set', () => {
    const part = makePart({
      externalSpeaker: { name: 'Pierre Martin' },
      assignee: makeUser('Jean', 'Dupont'),
    })
    expect(getPartDisplay(part)).toEqual({ text: 'Pierre Martin', isExternal: true })
  })

  it('prefers external speaker over internal assignee even when both are set', () => {
    const part = makePart({
      externalSpeaker: { name: 'Pierre Martin' },
      assignee: makeUser('Jean', 'Dupont'),
      assistant: makeUser('Marie', 'Curie'),
    })
    expect(getPartDisplay(part)).toEqual({ text: 'Pierre Martin', isExternal: true })
  })

  it('returns assignee alone when no assistant and no external speaker', () => {
    const part = makePart({ assignee: makeUser('Jean', 'Dupont') })
    expect(getPartDisplay(part)).toEqual({ text: 'Jean Dupont', isExternal: false })
  })

  it('returns assignee / assistant when both are set', () => {
    const part = makePart({ assignee: makeUser('Jean', 'Dupont'), assistant: makeUser('Marie', 'Curie') })
    expect(getPartDisplay(part)).toEqual({ text: 'Jean Dupont / Marie Curie', isExternal: false })
  })

  it('returns null text when nothing is set', () => {
    expect(getPartDisplay(makePart({}))).toEqual({ text: null, isExternal: false })
  })
})

describe('partMatchesQuery', () => {
  it('matches the external speaker name (caller is expected to lowercase the query)', () => {
    const part = makePart({ externalSpeaker: { name: 'Pierre Martin' } })
    expect(partMatchesQuery(part, 'pierre')).toBe(true)
    expect(partMatchesQuery(part, 'martin')).toBe(true)
    expect(partMatchesQuery(part, 'paul')).toBe(false)
  })

  it('matches the assignee name', () => {
    const part = makePart({ assignee: makeUser('Jean', 'Dupont') })
    expect(partMatchesQuery(part, 'dupont')).toBe(true)
  })

  it('matches the assistant name', () => {
    const part = makePart({ assignee: makeUser('Jean', 'Dupont'), assistant: makeUser('Marie', 'Curie') })
    expect(partMatchesQuery(part, 'curie')).toBe(true)
  })

  it('returns false when no name matches', () => {
    const part = makePart({
      externalSpeaker: { name: 'Pierre Martin' },
      assignee: makeUser('Jean', 'Dupont'),
      assistant: makeUser('Marie', 'Curie'),
    })
    expect(partMatchesQuery(part, 'paul')).toBe(false)
  })

  it('returns false when nothing is set', () => {
    expect(partMatchesQuery(makePart({}), 'jean')).toBe(false)
  })
})
