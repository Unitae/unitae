import { describe, expect, it } from 'vitest'

import { readSidebarOpenFromCookie } from './sidebar-cookie'

describe('readSidebarOpenFromCookie', () => {
  it('collapses only on an explicit sidebar_state=false', () => {
    expect(readSidebarOpenFromCookie('sidebar_state=false')).toBe(false)
    expect(readSidebarOpenFromCookie('sidebar_state=false; other=val')).toBe(false)
    expect(readSidebarOpenFromCookie('other=val; sidebar_state=false')).toBe(false)
    expect(readSidebarOpenFromCookie('a=1; sidebar_state=false; b=2')).toBe(false)
  })

  it('stays open for true, absent or malformed values', () => {
    expect(readSidebarOpenFromCookie('sidebar_state=true')).toBe(true)
    expect(readSidebarOpenFromCookie(null)).toBe(true)
    expect(readSidebarOpenFromCookie('')).toBe(true)
    expect(readSidebarOpenFromCookie('other=val')).toBe(true)
    expect(readSidebarOpenFromCookie('sidebar_state=falsehood')).toBe(true)
    expect(readSidebarOpenFromCookie('my_sidebar_state=false')).toBe(true)
    expect(readSidebarOpenFromCookie('sidebar_state=')).toBe(true)
  })

  it('tolerates irregular semicolon spacing', () => {
    expect(readSidebarOpenFromCookie('other=val;sidebar_state=false')).toBe(false)
    expect(readSidebarOpenFromCookie('other=val;  sidebar_state=false ; b=2')).toBe(false)
  })
})
