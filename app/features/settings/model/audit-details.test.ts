import { describe, expect, it } from 'vitest'
import { auditDetails } from './audit-details'

describe('auditDetails', () => {
  it('says nothing for a row that recorded nothing', () => {
    expect(auditDetails(null)).toEqual([])
    expect(auditDetails('text')).toEqual([])
    expect(auditDetails('[1,2]')).toEqual([])
  })

  it('reads the values as the log stores them, written as JSON', () => {
    expect(auditDetails('{"added":[],"removed":[6]}')).toEqual([
      { key: 'added', value: '—' },
      { key: 'removed', value: '6' },
    ])
  })

  it('lists each recorded value under its key', () => {
    expect(auditDetails(JSON.stringify({ reason: 'disabled', count: 3 }))).toEqual([
      { key: 'reason', value: 'disabled' },
      { key: 'count', value: '3' },
    ])
  })

  it('reads a change as its value before and after', () => {
    expect(auditDetails(JSON.stringify({ programme: { from: 4, to: null } }))).toEqual([
      { key: 'programme', value: '4 → —' },
    ])
  })

  it('joins a list and writes yes or no for a flag', () => {
    const [list, flag] = auditDetails(JSON.stringify({ zips: ['75001', '75002'], withFiles: true }))
    expect(list).toEqual({ key: 'zips', value: '75001, 75002' })
    expect(flag?.value).not.toBe('')
    expect(flag?.value).not.toBe('true')
  })

  it('writes any other shape as it was stored', () => {
    expect(auditDetails(JSON.stringify({ changes: { name: 'A' } }))).toEqual([
      { key: 'changes', value: '{"name":"A"}' },
    ])
  })
})
