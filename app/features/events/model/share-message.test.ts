import { describe, expect, it } from 'vitest'
import { findUnknownVariables, renderShareMessage, type ShareMessageContext } from './share-message'

function context(overrides: Partial<ShareMessageContext> = {}): ShareMessageContext {
  return {
    assignee: 'Jean Dupont',
    assigneeFirstname: 'Jean',
    assistant: null,
    partName: 'Lecture de la Bible',
    section: 'Joyaux spirituels',
    topic: null,
    duration: '4 min',
    date: 'mardi 3 septembre',
    time: '19:00',
    eventName: 'Réunion de semaine',
    note: null,
    congregation: 'Assemblée de Lyon',
    link: 'https://unitae.app/programs/events/12',
    ...overrides,
  }
}

describe('renderShareMessage', () => {
  it('substitutes every known variable', () => {
    const body = '{{assigneeFirstname}} — {{partName}} le {{date}} à {{time}}'

    expect(renderShareMessage(body, context())).toBe('Jean — Lecture de la Bible le mardi 3 septembre à 19:00')
  })

  it('tolerates whitespace inside the delimiters', () => {
    expect(renderShareMessage('{{ assignee }}', context())).toBe('Jean Dupont')
  })

  it('drops a line whose variables all resolve empty', () => {
    const body = 'Tu as {{partName}}.\nSujet : {{topic}}\nDurée : {{duration}}'

    expect(renderShareMessage(body, context({ topic: null }))).toBe('Tu as Lecture de la Bible.\nDurée : 4 min')
  })

  it('keeps a line where at least one variable resolves', () => {
    const body = '{{partName}} — {{topic}}'

    expect(renderShareMessage(body, context({ topic: null }))).toBe('Lecture de la Bible')
  })

  it('strips a separator left dangling by an empty variable', () => {
    const body = '{{partName}} : {{topic}}'

    expect(renderShareMessage(body, context({ topic: null }))).toBe('Lecture de la Bible')
  })

  it('treats a blank string the same as null', () => {
    const body = 'Avec : {{assistant}}'

    expect(renderShareMessage(body, context({ assistant: '   ' }))).toBe('')
  })

  it('preserves blank lines used as paragraph breaks', () => {
    const body = 'Bonjour {{assigneeFirstname}},\n\nTu as {{partName}}.'

    expect(renderShareMessage(body, context())).toBe('Bonjour Jean,\n\nTu as Lecture de la Bible.')
  })

  it('leaves a line with no variables untouched', () => {
    expect(renderShareMessage('Merci !', context())).toBe('Merci !')
  })

  it('renders an unknown variable as empty rather than leaking the placeholder', () => {
    expect(renderShareMessage('Salut {{nope}} !', context())).toBe('Salut !')
  })

  it('drops a line built around an empty variable even when it carries prose', () => {
    // The prose only exists to frame the variable, so it goes with it —
    // "Avec ce soir" would be nonsense.
    expect(renderShareMessage('Avec {{assistant}} ce soir', context({ assistant: null }))).toBe('')
  })

  it('keeps a line where an unknown variable sits beside a resolved one', () => {
    expect(renderShareMessage('{{partName}} {{nope}}', context())).toBe('Lecture de la Bible')
  })

  it('does not re-expand a variable produced by a substitution', () => {
    const body = 'Sujet : {{topic}}'

    expect(renderShareMessage(body, context({ topic: '{{assignee}}' }))).toBe('Sujet : {{assignee}}')
  })
})

describe('findUnknownVariables', () => {
  it('returns nothing for a body using only known variables', () => {
    expect(findUnknownVariables('{{assignee}} {{ date }}')).toEqual([])
  })

  it('reports each unknown variable once, in order of appearance', () => {
    expect(findUnknownVariables('{{nope}} {{assignee}} {{other}} {{nope}}')).toEqual(['nope', 'other'])
  })
})
