import { describe, expect, it } from 'vitest'
import { findResponsible, ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'

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
