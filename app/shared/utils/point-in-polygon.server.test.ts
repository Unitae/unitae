import { describe, expect, it } from 'vitest'
import { pointInPolygon } from './point-in-polygon.server'

describe('pointInPolygon', () => {
  const square: [number, number][] = [
    [0, 0],
    [0, 10],
    [10, 10],
    [10, 0],
  ]

  it("retourne true pour un point à l'intérieur d'un carré", () => {
    expect(pointInPolygon([5, 5], square)).toBe(true)
  })

  it("retourne false pour un point à l'extérieur d'un carré", () => {
    expect(pointInPolygon([15, 5], square)).toBe(false)
  })

  it('retourne false pour un point complètement éloigné', () => {
    expect(pointInPolygon([100, 100], square)).toBe(false)
  })

  it('fonctionne avec un triangle', () => {
    const triangle: [number, number][] = [
      [0, 0],
      [5, 10],
      [10, 0],
    ]

    expect(pointInPolygon([5, 5], triangle)).toBe(true)
    expect(pointInPolygon([1, 9], triangle)).toBe(false)
  })

  it('fonctionne avec un polygone concave (forme en L)', () => {
    const lShape: [number, number][] = [
      [0, 0],
      [0, 10],
      [5, 10],
      [5, 5],
      [10, 5],
      [10, 0],
    ]

    // Point dans la partie inférieure du L
    expect(pointInPolygon([7, 2], lShape)).toBe(true)
    // Point dans la partie supérieure du L
    expect(pointInPolygon([2, 7], lShape)).toBe(true)
    // Point dans le creux du L (extérieur)
    expect(pointInPolygon([7, 7], lShape)).toBe(false)
  })

  it('retourne false pour un polygone vide', () => {
    expect(pointInPolygon([5, 5], [])).toBe(false)
  })

  it('retourne false pour un point avec coordonnées négatives hors polygone', () => {
    expect(pointInPolygon([-5, -5], square)).toBe(false)
  })
})
