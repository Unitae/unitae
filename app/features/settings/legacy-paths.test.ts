import { describe, expect, it } from 'vitest'
import { currentSettingsPath } from './legacy-paths'

describe('currentSettingsPath', () => {
  it.each([
    ['/settings/congregation', '/settings/publishers'],
    ['/settings/congregation/', '/settings/publishers'],
    ['/settings/congregation/pioneer-goals', '/settings/publishers'],
    ['/settings/territories/card-overlays', '/settings/map'],
    ['/settings/congregation/templates', '/settings/templates'],
    ['/settings/congregation/presets', '/settings/part-types'],
    ['/settings/congregation/presets/3/edit', '/settings/part-types'],
    ['/settings/congregation/templates/new', '/settings/templates'],
    ['/settings/congregation/templates/4', '/settings/templates/4'],
    ['/settings/congregation/templates/4/edit', '/settings/templates/4'],
    ['/settings/congregation/templates/4/responsible', '/settings/templates/4'],
    ['/settings/users/12/edit', '/settings/users/12'],
    ['/settings/permissions', '/settings/roles'],
    ['/settings/permissions/7/edit', '/settings/roles?role=7'],
  ])('leads %s to %s', (from, to) => {
    expect(currentSettingsPath(from)).toBe(to)
  })

  it('knows nothing of an address that never moved', () => {
    expect(currentSettingsPath('/settings/general')).toBeNull()
    expect(currentSettingsPath('/settings/congregation/unknown')).toBeNull()
  })
})
