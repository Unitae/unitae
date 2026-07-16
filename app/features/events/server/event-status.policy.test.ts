import { describe, expect, it } from 'vitest'
import { ConflictError } from '~/shared/errors/app-error.server'
import { assertCanRelease, EVENT_STATUS_ERRORS } from './event-status.policy'

const spotlessPart = {
  name: 'Perle spirituelle',
  hasConflict: false,
  assignee: { firstname: 'Jean', lastname: 'Dupont' },
  assistant: null,
}

const spotlessService = {
  name: 'Accueil',
  hasConflict: false,
  assignee: { firstname: 'Marie', lastname: 'Curie' },
}

describe('assertCanRelease', () => {
  it('does not throw when there are no assignments', () => {
    expect(() => assertCanRelease({ parts: [], serviceRoles: [] })).not.toThrow()
  })

  it('does not throw when every assignment is conflict-free', () => {
    expect(() => assertCanRelease({ parts: [spotlessPart], serviceRoles: [spotlessService] })).not.toThrow()
  })

  it('throws ConflictError when a part assignment has a conflict', () => {
    const conflicting = { ...spotlessPart, hasConflict: true }
    expect(() => assertCanRelease({ parts: [conflicting], serviceRoles: [] })).toThrow(ConflictError)
  })

  it('throws ConflictError when a service role assignment has a conflict', () => {
    const conflicting = { ...spotlessService, hasConflict: true }
    expect(() => assertCanRelease({ parts: [], serviceRoles: [conflicting] })).toThrow(ConflictError)
  })

  // The manager needs to know WHICH assignments block release — a bare
  // "can't publish" toast forces them to hunt through the whole event.
  it('lists offending part assignments (name + assignee) in the error', () => {
    const conflictingPart = {
      name: 'Perle spirituelle',
      hasConflict: true,
      assignee: { firstname: 'Jean', lastname: 'Dupont' },
      assistant: null,
    }
    try {
      assertCanRelease({ parts: [conflictingPart], serviceRoles: [] })
      throw new Error('expected assertCanRelease to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictError)
      expect((e as Error).message).toContain('Perle spirituelle')
      expect((e as Error).message).toContain('Jean Dupont')
    }
  })

  // An assistant with a conflict is just as blocking as a speaker.
  it('lists the assistant name when the assistant is in conflict', () => {
    const conflictingPart = {
      name: 'Étude de la Tour de Garde',
      hasConflict: true,
      assignee: { firstname: 'Jean', lastname: 'Dupont' },
      assistant: { firstname: 'Marc', lastname: 'Bernard' },
    }
    try {
      assertCanRelease({ parts: [conflictingPart], serviceRoles: [] })
      throw new Error('expected assertCanRelease to throw')
    } catch (e) {
      expect((e as Error).message).toContain('Marc Bernard')
    }
  })

  it('lists offending service role assignments (name + assignee) in the error', () => {
    const conflictingService = {
      name: 'Accueil',
      hasConflict: true,
      assignee: { firstname: 'Marie', lastname: 'Curie' },
    }
    try {
      assertCanRelease({ parts: [], serviceRoles: [conflictingService] })
      throw new Error('expected assertCanRelease to throw')
    } catch (e) {
      expect((e as Error).message).toContain('Accueil')
      expect((e as Error).message).toContain('Marie Curie')
    }
  })

  it('starts the error with the shared prefix so the UI can style the intro', () => {
    const conflictingPart = { ...spotlessPart, hasConflict: true }
    try {
      assertCanRelease({ parts: [conflictingPart], serviceRoles: [] })
      throw new Error('expected assertCanRelease to throw')
    } catch (e) {
      expect((e as Error).message.startsWith(EVENT_STATUS_ERRORS.releaseBlockedByConflicts)).toBe(true)
    }
  })
})
