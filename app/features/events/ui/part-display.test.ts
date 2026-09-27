import { describe, expect, it } from 'vitest'
import * as m from '~/i18n/paraglide/messages'
import { formatMemberName, getPartAssigneeDisplay } from './part-display'

describe('formatMemberName', () => {
  it('returns null for null input', () => {
    expect(formatMemberName(null)).toBeNull()
  })

  it('joins firstname and lastname', () => {
    expect(formatMemberName({ firstname: 'Jane', lastname: 'Doe' })).toBe('Jane Doe')
  })

  it('trims when one part is missing', () => {
    expect(formatMemberName({ firstname: 'Jane', lastname: null })).toBe('Jane')
    expect(formatMemberName({ firstname: null, lastname: 'Doe' })).toBe('Doe')
  })

  it('returns null when both parts are empty', () => {
    expect(formatMemberName({ firstname: null, lastname: null })).toBeNull()
    expect(formatMemberName({ firstname: '', lastname: '' })).toBeNull()
  })

  it('prints the anonymized label, not the placeholder name stored on an anonymized member', () => {
    const anonymized = { firstname: 'Utilisateur', lastname: 'supprime', anonymizedAt: new Date() }

    expect(formatMemberName(anonymized)).toBe(m.board_read_status_anonymized_user())
  })

  it('treats a null anonymizedAt as a regular member', () => {
    expect(formatMemberName({ firstname: 'Jane', lastname: 'Doe', anonymizedAt: null })).toBe('Jane Doe')
  })
})

describe('getPartAssigneeDisplay', () => {
  it('returns the external speaker name when set, with no assistant', () => {
    const result = getPartAssigneeDisplay({
      assignee: { firstname: 'Jane', lastname: 'Doe' },
      assistant: { firstname: 'John', lastname: 'Reader' },
      externalSpeaker: { name: 'Joe External' },
    })
    expect(result).toEqual({ primary: 'Joe External', assistant: null, isExternal: true })
  })

  it('returns assignee and assistant when no external speaker', () => {
    const result = getPartAssigneeDisplay({
      assignee: { firstname: 'Jane', lastname: 'Doe' },
      assistant: { firstname: 'John', lastname: 'Reader' },
      externalSpeaker: null,
    })
    expect(result).toEqual({ primary: 'Jane Doe', assistant: 'John Reader', isExternal: false })
  })

  it('returns nulls when nothing is assigned', () => {
    const result = getPartAssigneeDisplay({
      assignee: null,
      assistant: null,
      externalSpeaker: null,
    })
    expect(result).toEqual({ primary: null, assistant: null, isExternal: false })
  })
})
