import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PartPlaceFields, type PartPlaces } from './PartPlaceFields'

// The first render, as the server sends it: what the pickers show and what the form would post.
const places: PartPlaces = {
  sections: ['Joyaux', 'Ministère'],
  halls: new Map([['Ministère', [{ name: 'Salle principale', trackOrder: 1 }]]]),
}
const render = (section: string, track: string, order: number | null) =>
  renderToString(h(PartPlaceFields, { places, section, track, order }))
const trigger = (markup: string, id: string) =>
  markup.match(new RegExp(`<button[^>]*id="${id}"[^>]*>.*?</button>`))?.[0] ?? ''

describe('PartPlaceFields, first render', () => {
  it('shows a drafted hall in an enabled picker, and posts the drafted place', () => {
    const markup = render('Ministère', 'Deuxième salle', 12)
    expect(trigger(markup, 'partTrack')).toContain('Deuxième salle')
    expect(trigger(markup, 'partTrack')).not.toContain('disabled=""')
    expect(markup).toContain('name="partTrack" value="Deuxième salle"')
    expect(markup).toContain('name="partOrder" value="12"')
    expect(markup).not.toContain('name="partTrackOrder"')
  })

  it('shows a drafted section, and a disabled hall picker for a section without halls', () => {
    const markup = render('Perles', '', 20)
    expect(trigger(markup, 'partSection')).toContain('Perles')
    expect(trigger(markup, 'partTrack')).toContain('disabled=""')
  })
})
