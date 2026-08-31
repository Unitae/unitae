import { describe, expect, it } from 'vitest'
import { haveIdentityFlagsChanged, type MemberIdentityFlags } from './member-identity'

const BASE: MemberIdentityFlags = {
  isPublisher: true,
  isMale: true,
  baptismDate: new Date('2000-01-15'),
  isAnointed: false,
  isHelder: false,
  isServant: false,
  leftAt: null,
}

describe('haveIdentityFlagsChanged', () => {
  it('returns false when the two snapshots match', () => {
    expect(haveIdentityFlagsChanged(BASE, { ...BASE })).toBe(false)
  })

  it('detects isPublisher flip', () => {
    expect(haveIdentityFlagsChanged(BASE, { ...BASE, isPublisher: false })).toBe(true)
  })

  it('detects isMale flip', () => {
    expect(haveIdentityFlagsChanged(BASE, { ...BASE, isMale: false })).toBe(true)
  })

  it('detects isMale becoming null', () => {
    expect(haveIdentityFlagsChanged(BASE, { ...BASE, isMale: null })).toBe(true)
  })

  it('detects baptismDate change by value, not reference', () => {
    expect(haveIdentityFlagsChanged(BASE, { ...BASE, baptismDate: new Date('2000-01-15') })).toBe(false)
    expect(haveIdentityFlagsChanged(BASE, { ...BASE, baptismDate: new Date('2001-01-15') })).toBe(true)
  })

  it('detects baptismDate becoming null', () => {
    expect(haveIdentityFlagsChanged(BASE, { ...BASE, baptismDate: null })).toBe(true)
  })

  it('detects isAnointed flip', () => {
    expect(haveIdentityFlagsChanged(BASE, { ...BASE, isAnointed: true })).toBe(true)
  })

  it('detects isHelder flip', () => {
    expect(haveIdentityFlagsChanged(BASE, { ...BASE, isHelder: true })).toBe(true)
  })

  it('detects isServant flip', () => {
    expect(haveIdentityFlagsChanged(BASE, { ...BASE, isServant: true })).toBe(true)
  })

  it('detects leftAt change by value', () => {
    expect(haveIdentityFlagsChanged(BASE, { ...BASE, leftAt: new Date('2024-06-01') })).toBe(true)
  })

  it('detects leftAt returning to null', () => {
    const left = { ...BASE, leftAt: new Date('2024-06-01') }
    expect(haveIdentityFlagsChanged(left, { ...left, leftAt: null })).toBe(true)
  })
})
