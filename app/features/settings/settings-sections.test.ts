import { describe, expect, it } from 'vitest'
import { buildSettingsSections } from './settings-sections'

const ADMIN = { canManageSettings: true, canManageUsers: true, canManagePermissions: true, canManagePioneerGoals: true }
const BILLING = 'https://www.unitae.app/billing?token=abc'

describe('buildSettingsSections', () => {
  it('groups all cards in order for a full admin with billing configured', () => {
    const sections = buildSettingsSections(ADMIN, BILLING)
    expect(sections.map(s => s.key)).toEqual(['account', 'modules', 'access', 'data'])
    expect(sections.map(s => s.items.map(i => i.key))).toEqual([
      ['general', 'subscription'],
      ['congregation', 'territories'],
      ['users', 'permissions'],
      ['data', 'audit'],
    ])
  })

  it('omits the subscription card (but keeps Général) when billing is not configured (self-hosted)', () => {
    const sections = buildSettingsSections(ADMIN, null)
    const account = sections.find(s => s.key === 'account')
    expect(account?.items.map(i => i.key)).toEqual(['general'])
  })

  it('points the subscription card at the billing URL', () => {
    const sections = buildSettingsSections(ADMIN, BILLING)
    const sub = sections.flatMap(s => s.items).find(i => i.key === 'subscription')
    expect(sub).toEqual({ key: 'subscription', href: BILLING, external: true })
  })

  it('drops empty groups — a user-manager sees only the access group with users', () => {
    const sections = buildSettingsSections(
      { canManageSettings: false, canManageUsers: true, canManagePermissions: false, canManagePioneerGoals: false },
      null,
    )
    expect(sections.map(s => s.key)).toEqual(['access'])
    expect(sections[0].items.map(i => i.key)).toEqual(['users'])
  })

  it('returns no sections when the viewer can manage nothing (drives the hub redirect)', () => {
    const sections = buildSettingsSections(
      { canManageSettings: false, canManageUsers: false, canManagePermissions: false, canManagePioneerGoals: false },
      null,
    )
    expect(sections).toEqual([])
  })

  it('shows only permissions to a permissions-manager', () => {
    const sections = buildSettingsSections(
      { canManageSettings: false, canManageUsers: false, canManagePermissions: true, canManagePioneerGoals: false },
      null,
    )
    expect(sections.map(s => s.key)).toEqual(['access'])
    expect(sections[0].items.map(i => i.key)).toEqual(['permissions'])
  })

  it('surfaces the congregation card to a pioneer-goal-manager (goals live inside the congregation module)', () => {
    // Pioneer goals is a sub-setting of the Congregation module; the parent card aggregates its
    // children's permissions, so a pioneer-goal-manager reaches goals through Congregation.
    const sections = buildSettingsSections(
      { canManageSettings: false, canManageUsers: false, canManagePermissions: false, canManagePioneerGoals: true },
      null,
    )
    expect(sections.map(s => s.key)).toEqual(['modules'])
    expect(sections[0].items.map(i => i.key)).toEqual(['congregation'])
  })
})
