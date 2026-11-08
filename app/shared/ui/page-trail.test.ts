import { describe, expect, it } from 'vitest'
import { trailFor } from './page-trail'

describe('trailFor', () => {
  it('starts with the sidebar group the page belongs to', () => {
    expect(trailFor('/publishers', [{ label: 'Proclamateurs' }])).toEqual([
      { label: 'Assemblée' },
      { label: 'Proclamateurs' },
    ])
  })

  it('keeps the crumbs and their links after the group', () => {
    expect(
      trailFor('/territories/buildings/12', [
        { label: 'Prospection', to: '/territories/buildings' },
        { label: '12 rue des Lilas' },
      ]),
    ).toEqual([
      { label: 'Territoires' },
      { label: 'Prospection', to: '/territories/buildings' },
      { label: '12 rue des Lilas' },
    ])
  })

  it('does not repeat the group when the first crumb already names it', () => {
    expect(trailFor('/territories', [{ label: 'Territoires' }])).toEqual([{ label: 'Territoires' }])
  })

  it('is only the crumbs on a page outside the sidebar groups', () => {
    expect(trailFor('/settings/general', [{ label: 'Réglages', to: '/settings' }, { label: 'Général' }])).toEqual([
      { label: 'Réglages', to: '/settings' },
      { label: 'Général' },
    ])
  })
})
