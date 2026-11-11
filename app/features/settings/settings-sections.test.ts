import { describe, expect, it } from 'vitest'
import { Permission } from '~/shared/types/permission'
import {
  firstSettingsHref,
  mayOpenSettings,
  type SettingsAccess,
  settingsGroups,
  settingsLinksFor,
} from './settings-sections'

const BILLING = 'https://www.unitae.app/billing?token=abc'

function access(permissions: Permission[], templateResponsible = false): SettingsAccess {
  return { permissions: new Set(permissions), templateResponsible }
}

const ADMIN = access(Object.values(Permission))

const keysOf = (a: SettingsAccess, billingUrl: string | null = null) =>
  settingsGroups(a, billingUrl).map(group => [group.key, group.entries.map(entry => entry.key)])

describe('settingsGroups', () => {
  it('lists every part, grouped and in order, for an administrator with billing configured', () => {
    expect(keysOf(ADMIN, BILLING)).toEqual([
      ['congregation', ['general', 'publishers', 'templates', 'part-types', 'territories', 'map']],
      ['access', ['users', 'roles']],
      ['data', ['data', 'audit']],
      ['account', ['subscription']],
    ])
  })

  it('leaves the subscription out on a self-hosted instance', () => {
    expect(keysOf(ADMIN).map(([group]) => group)).not.toContain('account')
  })

  it('points the subscription at the billing page, outside the app', () => {
    const subscription = settingsGroups(ADMIN, BILLING).flatMap(group => group.entries)[10]
    expect(subscription).toEqual({ key: 'subscription', href: BILLING, external: true })
  })

  it('opens each part with its own right, and drops the groups left empty', () => {
    expect(keysOf(access([Permission.CanSetPioneerGoals]))).toEqual([['congregation', ['publishers']]])
    expect(keysOf(access([Permission.CanViewUsers]))).toEqual([['access', ['users']]])
    expect(keysOf(access([Permission.CanConfigureTerritorySettings]))).toEqual([
      ['congregation', ['territories', 'map']],
    ])
    expect(keysOf(access([Permission.CanManagePrograms]))).toEqual([['congregation', ['part-types']]])
    expect(keysOf(access([Permission.CanExportCongregationData]))).toEqual([['data', ['data']]])
  })

  it('lets a template responsible in, to the programme templates only', () => {
    expect(keysOf(access([Permission.CanViewPrograms], true))).toEqual([['congregation', ['templates']]])
  })

  it('needs the administrator for an import, as the import page does', () => {
    expect(keysOf(access([Permission.CanImportCongregationData]))).toEqual([])
  })
})

describe('mayOpenSettings', () => {
  it('keeps Réglages closed to a publisher who can only read the programme', () => {
    expect(mayOpenSettings(access([Permission.CanViewPrograms, Permission.CanViewBoard]))).toBe(false)
  })

  it('opens Réglages to anyone with one part', () => {
    expect(mayOpenSettings(access([Permission.CanConfigurePermissions]))).toBe(true)
    expect(mayOpenSettings(access([], true))).toBe(true)
  })
})

describe('firstSettingsHref', () => {
  it('is the first part the viewer may open', () => {
    expect(firstSettingsHref(ADMIN)).toBe('/settings/general')
    expect(firstSettingsHref(access([Permission.CanManageUsers]))).toBe('/settings/users')
  })

  it('is null for someone with no part, never the subscription', () => {
    expect(firstSettingsHref(access([Permission.CanViewBoard]))).toBeNull()
  })
})

describe('settingsLinksFor', () => {
  it('lists the parts the viewer may open, without the subscription', () => {
    expect(settingsLinksFor(access([Permission.CanConfigurePermissions, Permission.CanViewUsers]))).toEqual([
      { key: 'users', href: '/settings/users' },
      { key: 'roles', href: '/settings/roles' },
    ])
  })
})
