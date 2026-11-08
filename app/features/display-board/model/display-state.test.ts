import { describe, expect, it } from 'vitest'
import { displayState } from './display-state'

const now = new Date('2026-11-08T12:00:00Z')
const days = (d: number) => new Date(now.getTime() + d * 86_400_000)

describe('displayState', () => {
  it('calls a document with no start date unpublished, whatever its end', () => {
    expect(displayState({ visibleFrom: null, visibleUntil: days(5), now })).toEqual({ kind: 'unpublished' })
  })

  it('calls a document starting later scheduled, with when', () => {
    expect(displayState({ visibleFrom: days(4), visibleUntil: null, now })).toEqual({
      kind: 'scheduled',
      from: days(4),
    })
  })

  it('calls a document whose end has passed expired, with when', () => {
    expect(displayState({ visibleFrom: days(-30), visibleUntil: days(-1), now })).toEqual({
      kind: 'expired',
      until: days(-1),
    })
  })

  it('calls the rest shown, with its end when it has one', () => {
    expect(displayState({ visibleFrom: days(-3), visibleUntil: null, now })).toEqual({ kind: 'shown', until: null })
    expect(displayState({ visibleFrom: days(-3), visibleUntil: days(10), now })).toEqual({
      kind: 'shown',
      until: days(10),
    })
  })

  it('agrees with the board on the edges: shown from its start, still shown at its end', () => {
    expect(displayState({ visibleFrom: now, visibleUntil: null, now }).kind).toBe('shown')
    expect(displayState({ visibleFrom: days(-1), visibleUntil: now, now }).kind).toBe('shown')
  })
})
