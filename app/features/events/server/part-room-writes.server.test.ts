import { describe, expect, it } from 'vitest'
import { inAnotherRoom } from './part-room-writes.server'

// Nobody holds two rooms of one part (user, 2026-11-28: « prevent it »): the rooms other than the one being assigned.
describe('inAnotherRoom', () => {
  const room = (
    assigneeId: number | null,
    assistantId: number | null = null,
    externalSpeakerId: number | null = null,
  ) => ({
    assigneeId,
    assistantId,
    externalSpeakerId,
  })
  const others = [room(7, 9), room(null, null, 11)]

  it('finds a speaker or a reader of another room, in either slot', () => {
    expect(inAnotherRoom(others, room(7))).toBe(true)
    expect(inAnotherRoom(others, room(null, 9))).toBe(true)
    expect(inAnotherRoom(others, room(9))).toBe(true)
  })

  it('finds an outside speaker of another room', () => {
    expect(inAnotherRoom(others, room(null, null, 11))).toBe(true)
  })

  it('lets anyone else, and nobody, through', () => {
    expect(inAnotherRoom(others, room(8, 10))).toBe(false)
    expect(inAnotherRoom(others, room(null))).toBe(false)
    expect(inAnotherRoom([], room(7))).toBe(false)
  })
})
