import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PartPlaceFields, type PartPlaces } from './PartPlaceFields'

// The first render, as the server sends it: what the fields show and what the form would post.
const rooms: PartPlaces['rooms'] = [
  { id: 50, name: null, isMain: true },
  { id: 51, name: 'Salle B', isMain: false },
  { id: 52, name: 'Salle C', isMain: false },
]
const render = (places: PartPlaces, section: string, roomIds: number[], order: number | null) =>
  renderToString(h(PartPlaceFields, { places, section, roomIds, order }))
const trigger = (markup: string, id: string) =>
  markup.match(new RegExp(`<button[^>]*id="${id}"[^>]*>.*?</button>`))?.[0] ?? ''
const posted = (markup: string) => [...markup.matchAll(/name="partRooms" value="(\d+)"/g)].map(match => match[1])

describe('PartPlaceFields, first render', () => {
  it('shows a drafted section and posts its place, the rooms managed', () => {
    const markup = render({ sections: ['Joyaux'], rooms }, 'Perles', [], 20)
    expect(trigger(markup, 'partSection')).toContain('Perles')
    expect(markup).toContain('name="partOrder" value="20"')
    expect(markup).toContain('name="partRoomsManaged" value="on"')
    expect(markup).not.toContain('name="partTrack"')
  })

  it('holds a part of the whole congregation in the main room, the rooms not listed', () => {
    const markup = render({ sections: ['Joyaux'], rooms }, 'Joyaux', [50], 3)
    expect(posted(markup)).toEqual(['50'])
    expect(markup).toContain('Toute l’assemblée')
    expect(markup).not.toContain('Salle B')
  })

  it('lists the rooms of a part in parallel, the main room always ticked, and posts its rooms', () => {
    const markup = render({ sections: ['Joyaux'], rooms }, 'Joyaux', [50, 52], 3)
    expect(posted(markup)).toEqual(['50', '52'])
    expect(markup).toContain('Salle principale')
    expect(markup).toContain('toujours')
    expect(markup).toContain('cette partie aura 2 orateurs')
  })

  it('says a template with one room has no choice', () => {
    const markup = render({ sections: ['Joyaux'], rooms: rooms.slice(0, 1) }, 'Joyaux', [], 3)
    expect(markup).toContain('Toute l’assemblée, dans la salle principale.')
    expect(markup).toContain('ajoutez d’abord une salle au modèle')
    expect(posted(markup)).toEqual(['50'])
  })
})
