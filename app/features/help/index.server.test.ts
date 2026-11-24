import { describe, expect, it } from 'vitest'
import { visibleHelpSlugsFor } from '~/features/help/index.server'
import type { HelpReader } from '~/features/help/model/help-access'
import { Permission } from '~/shared/types/permission'

/** A reader holding these permissions and leading no group. */
function readerWith(...permissions: Permission[]): HelpReader {
  return { permissions: new Set(permissions), leadsGroup: false, answersForSchedule: false }
}

describe('the help server barrel', () => {
  it('lists the shipped articles a reader may open, with the « ? » entry points they need', () => {
    const publisher = visibleHelpSlugsFor(readerWith(), 'fr')
    expect(publisher).toContain('absences')
    expect(publisher).toContain('my-territories')
    expect(publisher).not.toContain('bano')

    const settings = visibleHelpSlugsFor(readerWith(Permission.CanConfigureTerritorySettings), 'fr')
    expect(settings).toContain('bano')
    expect(settings).toContain('phone-territories')
  })
})
