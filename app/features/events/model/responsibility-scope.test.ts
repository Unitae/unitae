import { describe, expect, it } from 'vitest'
import {
  findResponsible,
  RESPONSIBILITY_SCOPES,
  ResponsibilityScope,
  scopesCovering,
} from '~/features/events/model/responsibility-scope.type'

describe('scopesCovering', () => {
  it('accepts only the programme delegation for a programme request', () => {
    expect(scopesCovering(ResponsibilityScope.Programme)).toEqual(['programme'])
  })

  it('accepts either delegation for a service request', () => {
    expect(scopesCovering(ResponsibilityScope.Service)).toEqual(expect.arrayContaining(['programme', 'service']))
  })

  it('never returns a scope outside the catalogue', () => {
    for (const scope of RESPONSIBILITY_SCOPES) {
      for (const covering of scopesCovering(scope)) {
        expect(RESPONSIBILITY_SCOPES).toContain(covering)
      }
    }
  })
})

describe('findResponsible', () => {
  const rows = [
    { scope: 'programme', roleId: 1 },
    { scope: 'service', roleId: 2 },
  ]

  it('returns the row for the requested scope', () => {
    expect(findResponsible(rows, ResponsibilityScope.Programme)).toEqual({ scope: 'programme', roleId: 1 })
    expect(findResponsible(rows, ResponsibilityScope.Service)).toEqual({ scope: 'service', roleId: 2 })
  })

  it('does not fall back to the programme row when only it exists', () => {
    expect(findResponsible([rows[0]], ResponsibilityScope.Service)).toBeNull()
  })

  it('returns null on an empty relation', () => {
    expect(findResponsible([], ResponsibilityScope.Programme)).toBeNull()
  })
})
