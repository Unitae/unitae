import { describe, expect, it } from 'vitest'

import { inTerritoryView, parseTerritorySort, sortTerritories, territoryViewCounts } from './territory-list'

// The territories list: Tous / Disponibles / Sortis / En retard, and its orders — by number the way people count, the
// least recently attributed first, or the nearest to a searched place.

const row = (
  number: string,
  over: { held?: boolean; state?: string; kind?: string; lastDay?: string | null; distance?: number | null } = {},
) => ({
  number,
  holder: over.held ? { state: over.state ?? 'on-time' } : null,
  availability: { kind: over.kind ?? (over.held ? 'held' : 'free') },
  lastDay: over.lastDay ?? null,
  distance: over.distance ?? null,
})

describe('territory views', () => {
  const rows = [
    row('T1', { held: true, state: 'overdue' }),
    row('T2', { held: true, state: 'on-time' }),
    row('T3'),
    row('T4', { kind: 'resting' }),
    row('T5', { held: true, state: 'paused', kind: 'paused' }),
  ]

  it('counts all of them, those free today, those out, and those late', () => {
    expect(territoryViewCounts(rows as never)).toEqual({ all: 5, free: 2, out: 3, late: 1 })
  })

  it('puts each in its views; a territory a campaign paused is free for it, as on « Attribuer »', () => {
    expect(rows.filter(r => inTerritoryView(r as never, 'late')).map(r => r.number)).toEqual(['T1'])
    expect(rows.filter(r => inTerritoryView(r as never, 'free')).map(r => r.number)).toEqual(['T3', 'T5'])
  })
})

describe('sortTerritories', () => {
  it('sorts by number the way people count', () => {
    const rows = [row('T10'), row('H1'), row('T2')]
    expect(sortTerritories(rows, 'number', 'fr').map(r => r.number)).toEqual(['H1', 'T2', 'T10'])
  })

  it('puts the never attributed first, then the least recently attributed', () => {
    const rows = [row('T1', { lastDay: '2026-05-12' }), row('T2'), row('T3', { lastDay: '2025-11-03' })]
    expect(sortTerritories(rows, 'last', 'fr').map(r => r.number)).toEqual(['T2', 'T3', 'T1'])
  })

  it('puts the nearest first, the unplaced last', () => {
    const rows = [row('T1', { distance: null }), row('T2', { distance: 900 }), row('T3', { distance: 50 })]
    expect(sortTerritories(rows, 'proximity', 'fr').map(r => r.number)).toEqual(['T3', 'T2', 'T1'])
  })
})

describe('parseTerritorySort', () => {
  it('sorts by number by default, by proximity once a place was found', () => {
    expect(parseTerritorySort(new URLSearchParams(''), false)).toBe('number')
    expect(parseTerritorySort(new URLSearchParams(''), true)).toBe('proximity')
    expect(parseTerritorySort(new URLSearchParams('sort=last'), true)).toBe('last')
    expect(parseTerritorySort(new URLSearchParams('sort=proximity'), false)).toBe('number')
  })
})
