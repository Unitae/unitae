import { describe, expect, it } from 'vitest'
import { categoryWildcard } from './resolve-recipients.server'

describe('categoryWildcard', () => {
  it("extracts category from 'board.document.created' → 'board.*'", () => {
    expect(categoryWildcard('board.document.created')).toBe('board.*')
  })

  it("extracts category from 'attribution.created' → 'attribution.*'", () => {
    expect(categoryWildcard('attribution.created')).toBe('attribution.*')
  })

  it("appends '.*' when there is no dot — 'category' → 'category.*'", () => {
    expect(categoryWildcard('category')).toBe('category.*')
  })

  it("uses only the first segment for 'a.b.c.d' → 'a.*'", () => {
    expect(categoryWildcard('a.b.c.d')).toBe('a.*')
  })

  it("handles empty string → '.*'", () => {
    expect(categoryWildcard('')).toBe('.*')
  })

  it('already-wildcard type preserves only the first segment', () => {
    expect(categoryWildcard('board.*')).toBe('board.*')
  })
})
