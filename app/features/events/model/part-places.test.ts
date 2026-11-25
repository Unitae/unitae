import { describe, expect, it } from 'vitest'
import { type PartPlaces, placeChoices, roomLabel, roomsAfterWhere, roomsTakenAway } from './part-places'

const places: PartPlaces = {
  sections: ['Joyaux', 'Ministère', 'Vie chrétienne'],
  rooms: [
    { id: 50, name: null, isMain: true },
    { id: 51, name: 'Salle B', isMain: false },
    { id: 52, name: 'Salle C', isMain: false },
  ],
}

describe('placeChoices', () => {
  it('sends the order only while the part stays in the section it was opened in', () => {
    const opened = { section: 'Ministère', order: 7 }
    expect(placeChoices(places, opened, 'Ministère').order).toBe('7')
    expect(placeChoices(places, opened, 'Joyaux').order).toBe('')
    expect(placeChoices(places, { ...opened, order: null }, 'Ministère').order).toBe('')
  })

  it('offers a drafted section with the others', () => {
    expect(placeChoices(places, { section: 'Perles', order: 20 }, 'Perles').sections).toEqual([
      'Joyaux',
      'Ministère',
      'Vie chrétienne',
      'Perles',
    ])
    expect(placeChoices(places, { section: 'Joyaux', order: 2 }, 'Joyaux').sections).toEqual(places.sections)
  })
})

describe('roomsAfterWhere', () => {
  it('holds a part for the whole congregation in the main room alone, whatever was ticked', () => {
    expect(roomsAfterWhere(places.rooms, false, [51, 52])).toEqual([50])
  })

  it('holds a part in parallel in the main room and the rooms ticked, in the rooms’ order', () => {
    expect(roomsAfterWhere(places.rooms, true, [52])).toEqual([50, 52])
    expect(roomsAfterWhere(places.rooms, true, [52, 51, 50])).toEqual([50, 51, 52])
    // A room gone meanwhile is left out.
    expect(roomsAfterWhere(places.rooms, true, [51, 99])).toEqual([50, 51])
  })
})

describe('roomsTakenAway', () => {
  it('names the rooms a save takes the part out of, none for a room added or a new part', () => {
    expect(roomsTakenAway(places.rooms, [50, 51, 52], [50, 52]).map(room => room.id)).toEqual([51])
    expect(roomsTakenAway(places.rooms, [50, 51, 52], [50]).map(room => room.id)).toEqual([51, 52])
    expect(roomsTakenAway(places.rooms, [50], [50, 51])).toEqual([])
    expect(roomsTakenAway(places.rooms, null, [50])).toEqual([])
  })
})

describe('roomLabel', () => {
  it('reads an unnamed main room « Salle principale », any other by its name', () => {
    expect(roomLabel(places.rooms[0] as PartPlaces['rooms'][number])).toBe('Salle principale')
    expect(roomLabel({ id: 50, name: 'Auditorium', isMain: true })).toBe('Auditorium')
    expect(roomLabel(places.rooms[1] as PartPlaces['rooms'][number])).toBe('Salle B')
  })
})
