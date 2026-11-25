import { describe, expect, it } from 'vitest'
import { type PartPlaces, pickSection, placeChoices } from './part-places'

const places: PartPlaces = {
  sections: ['Joyaux', 'Ministère', 'Vie chrétienne'],
  halls: new Map([
    [
      'Ministère',
      [
        { name: 'Salle principale', trackOrder: 1 },
        { name: 'Salle B', trackOrder: 2 },
      ],
    ],
    ['Vie chrétienne', [{ name: 'Salle annexe', trackOrder: 1 }]],
  ]),
}

describe('placeChoices', () => {
  it('offers the chosen section’s halls only, none for a section without any', () => {
    const opened = { section: 'Joyaux', track: '', order: 3 }
    expect(placeChoices(places, opened, { section: 'Ministère', track: '' }).halls.map(each => each.name)).toEqual([
      'Salle principale',
      'Salle B',
    ])
    expect(placeChoices(places, opened, { section: 'Joyaux', track: '' }).halls).toEqual([])
  })

  it('sends the order only while the part stays where it was opened', () => {
    const opened = { section: 'Ministère', track: 'Salle B', order: 7 }
    expect(placeChoices(places, opened, { section: 'Ministère', track: 'Salle B' }).order).toBe('7')
    expect(placeChoices(places, opened, { section: 'Ministère', track: 'Salle principale' }).order).toBe('')
    expect(placeChoices(places, opened, { section: 'Joyaux', track: '' }).order).toBe('')
    expect(placeChoices(places, { ...opened, order: null }, { section: 'Ministère', track: 'Salle B' }).order).toBe('')
  })

  it('offers a drafted section and hall while they are the ones chosen', () => {
    const newSection = placeChoices(
      places,
      { section: 'Perles', track: '', order: 20 },
      { section: 'Perles', track: '' },
    )
    expect(newSection.sections).toEqual(['Joyaux', 'Ministère', 'Vie chrétienne', 'Perles'])
    const newHall = { section: 'Ministère', track: 'Salle 3', order: 9 }
    expect(placeChoices(places, newHall, newHall).halls.map(each => each.name)).toEqual([
      'Salle principale',
      'Salle B',
      'Salle 3',
    ])
    // Another section picked: the drafted hall is not offered there.
    expect(
      placeChoices(places, newHall, { section: 'Vie chrétienne', track: '' }).halls.map(each => each.name),
    ).toEqual(['Salle annexe'])
  })
})

describe('pickSection', () => {
  it('starts the hall at none in the section picked', () => {
    expect(pickSection('Vie chrétienne')).toEqual({ section: 'Vie chrétienne', track: '' })
  })
})
