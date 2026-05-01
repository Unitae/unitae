import { describe, expect, it } from 'vitest'
import { computeEntranceCentroid } from './compute-entrance-centroid'

describe('computeEntranceCentroid', () => {
  it('retourne null pour un tableau vide', () => {
    expect(computeEntranceCentroid([])).toBeNull()
  })

  it('retourne null si toutes les coordonnées sont nulles', () => {
    expect(
      computeEntranceCentroid([
        { latitude: null, longitude: null },
        { latitude: null, longitude: null },
      ]),
    ).toBeNull()
  })

  it('ignore les bâtiments sans coordonnées et calcule la moyenne des autres', () => {
    const centroid = computeEntranceCentroid([
      { latitude: 48.8566, longitude: 2.3522 },
      { latitude: null, longitude: null },
      { latitude: 48.8666, longitude: 2.3622 },
    ])
    expect(centroid?.latitude).toBeCloseTo(48.8616, 6)
    expect(centroid?.longitude).toBeCloseTo(2.3572, 6)
  })

  it('renvoie les coordonnées du seul bâtiment géocodé', () => {
    expect(computeEntranceCentroid([{ latitude: 45.7, longitude: 4.83 }])).toEqual({ latitude: 45.7, longitude: 4.83 })
  })

  it('moyenne plusieurs bâtiments géocodés', () => {
    expect(
      computeEntranceCentroid([
        { latitude: 0, longitude: 0 },
        { latitude: 10, longitude: 20 },
      ]),
    ).toEqual({ latitude: 5, longitude: 10 })
  })

  it('renvoie les coordonnées exactes pour des points identiques', () => {
    expect(
      computeEntranceCentroid([
        { latitude: 48.8566, longitude: 2.3522 },
        { latitude: 48.8566, longitude: 2.3522 },
      ]),
    ).toEqual({ latitude: 48.8566, longitude: 2.3522 })
  })

  it('considère manquant un bâtiment avec une seule coordonnée nulle', () => {
    expect(
      computeEntranceCentroid([
        { latitude: 48.8566, longitude: null },
        { latitude: 10, longitude: 20 },
      ]),
    ).toEqual({ latitude: 10, longitude: 20 })
  })
})
