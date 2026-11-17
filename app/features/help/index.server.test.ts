import { describe, expect, it } from 'vitest'
import { visibleHelpSlugsFor } from '~/features/help/index.server'
import { Permission } from '~/shared/types/permission'

describe('the help server barrel', () => {
  it('lists the shipped articles a reader may open, with the « ? » entry points they need', () => {
    const publisher = visibleHelpSlugsFor(new Set())
    expect(publisher).toContain('absences')
    expect(publisher).toContain('my-territories')
    expect(publisher).not.toContain('bano')

    const settings = visibleHelpSlugsFor(new Set([Permission.CanConfigureTerritorySettings]))
    expect(settings).toContain('bano')
    expect(settings).toContain('phone-territories')
  })
})
