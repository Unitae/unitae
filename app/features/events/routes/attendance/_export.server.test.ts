import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'

const permissionsContext = Symbol('permissions')
const currentAccountContext = Symbol('account')
const congregationContext = Symbol('congregation')
vi.mock('~/shared/auth/route-context.server', () => ({
  permissionsContext,
  currentAccountContext,
  congregationContext,
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) => fn({}),
}))
const listServiceYearAttendance = vi.fn()
vi.mock('~/features/events/server/attendance.queries', () => ({
  listServiceYearAttendance: (...args: unknown[]) => listServiceYearAttendance(...args),
}))

const { loadAttendanceExport } = await import('./_export.server')

function contextWith(permissions: Permission[]) {
  const values = new Map<symbol, unknown>([
    [permissionsContext, new Set(permissions)],
    [currentAccountContext, { id: 9, congregationId: 3 }],
    [congregationContext, { timezone: 'Europe/Paris', name: 'Les Lilas', displayName: null }],
  ])
  return { get: (key: symbol) => values.get(key) } as never
}
const request = (search = '') => new Request(`http://localhost/attendance/record.pdf${search}`)

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-17T09:00:00Z'), toFake: ['Date'] })
  listServiceYearAttendance.mockReset().mockResolvedValue([])
})

describe('loadAttendanceExport', () => {
  // The file is the attendance page's figures: the same right, never a year the page would not show.
  it('refuses whoever may not read attendance, whatever else they may do', async () => {
    const recorder = contextWith([Permission.CanRecordAttendance, Permission.CanCorrectAttendance])
    await expect(loadAttendanceExport(request(), recorder)).rejects.toMatchObject({ status: 302 })
    expect(listServiceYearAttendance).not.toHaveBeenCalled()
  })

  it('sends a year still to come, or no year, back to the attendance page', async () => {
    const reader = contextWith([Permission.CanViewAttendance])
    await expect(loadAttendanceExport(request('?year=2031'), reader)).rejects.toMatchObject({ status: 302 })
    await expect(loadAttendanceExport(request('?year=abc'), reader)).rejects.toMatchObject({ status: 302 })
  })

  it('reads the year asked for and the one before it, in the congregation’s zone', async () => {
    const data = await loadAttendanceExport(request('?year=2025'), contextWith([Permission.CanViewAttendance]))

    expect(data).toMatchObject({ serviceYear: 2025, timeZone: 'Europe/Paris', congregationName: 'Les Lilas' })
    expect(listServiceYearAttendance.mock.calls.map(([, input]) => input.serviceYear)).toEqual([2025, 2024])
  })

  it('reads the current service year when none is asked for', async () => {
    const data = await loadAttendanceExport(request(), contextWith([Permission.CanViewAttendance]))
    expect(data.serviceYear).toBe(2026)
  })
})
