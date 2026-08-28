import { describe, expect, it } from 'vitest'
import {
  assertCanSetParent,
  assertCanShowInOrganigram,
  canShowInOrganigram,
  MAX_ORGANIGRAM_DEPTH,
  ROLE_TREE_ERRORS,
} from '~/shared/domain/role-tree.policy'
import { ForbiddenError, ValidationError } from '~/shared/errors/app-error.server'

// Invariants the database cannot hold. A composite foreign key stops a role being parented
// into another congregation, but nothing at the schema level prevents A → B → A, an
// unbounded chain, or an auto-synced identity roster being given a parent.
//
// Pure functions: the caller loads the chain and hands over a plain shape.

/** The proposed parent and its ancestors, nearest first — what the caller must supply. */
function chain(...ids: number[]) {
  return ids
}

describe('assertCanSetParent — cycles', () => {
  it('rejects a role parented to itself', () => {
    expect(() =>
      assertCanSetParent({ roleId: 7, roleKey: 'sono', parentChainIds: chain(7), subtreeHeight: 0 }),
    ).toThrow(ValidationError)
  })

  it('rejects a role parented to its own descendant', () => {
    // Moving 7 under 9, where 9's chain back to the root passes through 7.
    expect(() =>
      assertCanSetParent({ roleId: 7, roleKey: 'sono', parentChainIds: chain(9, 8, 7, 1), subtreeHeight: 0 }),
    ).toThrow(ValidationError)
  })

  it('names the parent field so the form can surface it', () => {
    try {
      assertCanSetParent({ roleId: 7, roleKey: 'sono', parentChainIds: chain(7), subtreeHeight: 0 })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).field).toBe('parentRoleId')
      expect((error as ValidationError).message).toBe(ROLE_TREE_ERRORS.cycle)
    }
  })

  it('accepts an unrelated parent', () => {
    expect(() =>
      assertCanSetParent({ roleId: 7, roleKey: 'sono', parentChainIds: chain(9, 8, 1), subtreeHeight: 0 }),
    ).not.toThrow()
  })

  it('accepts detaching to a root', () => {
    expect(() => assertCanSetParent({ roleId: 7, roleKey: 'sono', parentChainIds: [], subtreeHeight: 0 })).not.toThrow()
  })
})

describe('assertCanSetParent — depth', () => {
  // A chain of n ids puts the moved role at level n + 1. The real congregation sheet
  // reaches 7 levels, so the cap has headroom rather than being a design constraint.
  const chainOfLength = (n: number) => Array.from({ length: n }, (_, i) => i + 100)

  it('accepts a move that lands exactly on the cap', () => {
    expect(() =>
      assertCanSetParent({
        roleId: 7,
        roleKey: 'sono',
        parentChainIds: chainOfLength(MAX_ORGANIGRAM_DEPTH - 1),
        subtreeHeight: 0,
      }),
    ).not.toThrow()
  })

  it('rejects a move one level past the cap', () => {
    expect(() =>
      assertCanSetParent({
        roleId: 7,
        roleKey: 'sono',
        parentChainIds: chainOfLength(MAX_ORGANIGRAM_DEPTH),
        subtreeHeight: 0,
      }),
    ).toThrow(ValidationError)
  })

  it('counts the moved role’s own descendants, not just the role', () => {
    // Lands at the cap itself, but drags two levels of children past it.
    expect(() =>
      assertCanSetParent({
        roleId: 7,
        roleKey: 'sono',
        parentChainIds: chainOfLength(MAX_ORGANIGRAM_DEPTH - 1),
        subtreeHeight: 2,
      }),
    ).toThrow(ValidationError)
  })
})

describe('assertCanSetParent — identity rosters are roots', () => {
  it.each(['elder', 'assistant-servant'])('rejects giving %s a parent', key => {
    expect(() => assertCanSetParent({ roleId: 7, roleKey: key, parentChainIds: chain(9), subtreeHeight: 0 })).toThrow(
      ForbiddenError,
    )
  })

  it.each(['elder', 'assistant-servant'])('allows %s to stay a root', key => {
    expect(() => assertCanSetParent({ roleId: 7, roleKey: key, parentChainIds: [], subtreeHeight: 0 })).not.toThrow()
  })
})

describe('assertCanShowInOrganigram', () => {
  it.each(['elder', 'assistant-servant'])('allows the %s roster', key => {
    expect(() => assertCanShowInOrganigram(key)).not.toThrow()
  })

  it.each([
    'sister',
    'brother',
    'pioneer',
    'publisher',
    'baptized',
    'member',
  ])('rejects the %s identity role — a population, not a position', key => {
    expect(() => assertCanShowInOrganigram(key)).toThrow(ForbiddenError)
  })

  it('rejects the admin system role — authority over the software, not a position', () => {
    expect(() => assertCanShowInOrganigram('admin')).toThrow(ForbiddenError)
  })

  it('allows a custom role', () => {
    expect(() => assertCanShowInOrganigram('comite-de-service')).not.toThrow()
  })
})

describe('canShowInOrganigram — the non-throwing form, for filtering lists', () => {
  it('agrees with the assertion it mirrors', () => {
    // The picker must not offer a role the service would then refuse: an admin choosing
    // « Administrateur » and getting an error is a bug in the list, not in the rule.
    for (const key of ['elder', 'assistant-servant', 'comite-de-service', 'sono']) {
      expect(canShowInOrganigram(key)).toBe(true)
    }
    for (const key of ['sister', 'brother', 'pioneer', 'publisher', 'baptized', 'member', 'admin']) {
      expect(canShowInOrganigram(key)).toBe(false)
    }
  })
})
