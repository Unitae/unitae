import { describe, expect, it } from 'vitest'
import { readState, replacementDate } from './read-state'

const now = new Date('2026-11-08T12:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000)

describe('readState', () => {
  it('calls a document nobody opened new for two days, then just unread', () => {
    expect(readState({ createdAt: hoursAgo(5), changedAt: null, viewedAt: undefined, now })).toEqual({
      unread: true,
      badge: 'new',
    })
    expect(readState({ createdAt: hoursAgo(49), changedAt: null, viewedAt: undefined, now })).toEqual({
      unread: true,
      badge: null,
    })
  })

  it('counts a read as read when nothing changed since', () => {
    expect(readState({ createdAt: hoursAgo(100), changedAt: hoursAgo(80), viewedAt: hoursAgo(10), now })).toEqual({
      unread: false,
      badge: null,
    })
  })

  it('makes a document unread again, and updated, when it changed after the read', () => {
    expect(readState({ createdAt: hoursAgo(100), changedAt: hoursAgo(2), viewedAt: hoursAgo(10), now })).toEqual({
      unread: true,
      badge: 'updated',
    })
  })

  it('counts an undated read as having read the current version, since nothing tells otherwise', () => {
    expect(readState({ createdAt: hoursAgo(100), changedAt: hoursAgo(2), viewedAt: null, now })).toEqual({
      unread: false,
      badge: null,
    })
  })

  it('does not call a recent document new once it has been opened', () => {
    expect(readState({ createdAt: hoursAgo(3), changedAt: null, viewedAt: hoursAgo(1), now })).toEqual({
      unread: false,
      badge: null,
    })
  })
})

describe('replacementDate', () => {
  it('ignores the version written with the document, which is its first file', () => {
    expect(replacementDate(hoursAgo(100), new Date(hoursAgo(100).getTime() + 200))).toBeNull()
  })

  it('takes a later version as the last time the file was replaced', () => {
    expect(replacementDate(hoursAgo(100), hoursAgo(2))).toEqual(hoursAgo(2))
  })

  it('says never when there is no version at all', () => {
    expect(replacementDate(hoursAgo(100), undefined)).toBeNull()
  })
})
