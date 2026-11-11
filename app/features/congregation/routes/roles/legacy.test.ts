import { describe, expect, it } from 'vitest'
import { organigramPathFor } from './legacy'

// The role pages became the organigram's dialogs and panel: an old link opens the right one.

describe('organigramPathFor', () => {
  it('opens a role’s panel from its old edit or delete page', () => {
    expect(organigramPathFor('/congregation/roles/42/edit')).toBe('/congregation/roles/organigram?role=42')
    expect(organigramPathFor('/congregation/roles/42/delete')).toBe('/congregation/roles/organigram?role=42')
  })

  it('opens the new-role dialog from the old creation page', () => {
    expect(organigramPathFor('/congregation/roles/new')).toBe('/congregation/roles/organigram?new=1')
  })

  it('opens the committee takeover from its old page', () => {
    expect(organigramPathFor('/congregation/roles/organigram/adopt')).toBe('/congregation/roles/organigram?adopt=1')
  })
})
