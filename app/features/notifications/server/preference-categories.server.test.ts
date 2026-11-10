import { describe, expect, it } from 'vitest'
import { derivePreferenceCategories } from './preference-categories.server'

describe('derivePreferenceCategories', () => {
  it('groups the registry by category.key', () => {
    const categories = derivePreferenceCategories()
    const keys = categories.map(c => c.key)
    expect(keys).toContain('board')
    expect(keys).toContain('territory')
  })

  it('resolves label accessors into plain strings for each category and type', () => {
    const categories = derivePreferenceCategories()
    for (const category of categories) {
      expect(typeof category.label).toBe('string')
      expect(category.label.length).toBeGreaterThan(0)
      for (const type of category.types) {
        expect(typeof type.label).toBe('string')
        expect(type.label.length).toBeGreaterThan(0)
      }
    }
  })

  it('leaves out the types the reader cannot receive, and the categories left empty', () => {
    const categories = derivePreferenceCategories(
      new Set(['programme.assignment.assigned', 'programme.assignment.unassigned']),
    )

    expect(categories.map(c => c.key)).toEqual(['programme'])
    expect(categories[0]?.types.map(t => t.type)).toEqual([
      'programme.assignment.assigned',
      'programme.assignment.unassigned',
    ])
  })

  it('carries the line that says why a category reaches the reader', () => {
    const board = derivePreferenceCategories().find(c => c.key === 'board')

    expect(board?.hint).toEqual(expect.any(String))
  })

  it('groups every board.document.* type under the same category', () => {
    const categories = derivePreferenceCategories()
    const board = categories.find(c => c.key === 'board')
    expect(board).toBeDefined()
    const types = new Set(board?.types.map(t => t.type))
    expect(types).toContain('board.document.created')
    expect(types).toContain('board.document.updated')
    expect(types).toContain('board.document.deleted')
    expect(types).toContain('board.document.expiring')
  })
})
