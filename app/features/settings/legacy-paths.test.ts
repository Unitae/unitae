import { describe, expect, it } from 'vitest'
import { currentSettingsPath } from './legacy-paths'

describe('currentSettingsPath', () => {
  it.each([
    ['/settings/congregation', '/settings/publishers'],
    ['/settings/congregation/', '/settings/publishers'],
    ['/settings/congregation/pioneer-goals', '/settings/publishers'],
  ])('leads %s to %s', (from, to) => {
    expect(currentSettingsPath(from)).toBe(to)
  })

  it('knows nothing of an address that never moved', () => {
    expect(currentSettingsPath('/settings/general')).toBeNull()
    expect(currentSettingsPath('/settings/congregation/unknown')).toBeNull()
  })
})
