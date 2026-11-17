import excelJs from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildAttendanceXlsx } from './attendance-xlsx.server'

const PARIS = 'Europe/Paris'
const ESCAPED = /^'/
const NOW = new Date('2026-11-17T09:00:00Z')
const row = (
  startDate: string,
  kind: 'midweek' | 'weekend' | 'separate',
  inPerson: number | null,
  online: number | null,
) => ({
  name: kind === 'midweek' ? 'Réunion de semaine' : kind === 'weekend' ? 'Réunion du week-end' : '=HYPERLINK("x")',
  startDate: new Date(startDate),
  day: startDate.slice(0, 10),
  kind,
  inPerson,
  online,
})

async function read(buffer: ArrayBuffer | Buffer) {
  const workbook = new excelJs.Workbook()
  await workbook.xlsx.load(buffer as ArrayBuffer)
  return workbook
}

describe('buildAttendanceXlsx', () => {
  const meetings = [
    row('2026-09-03T17:00:00Z', 'midweek', 70, 15),
    row('2026-09-06T08:00:00Z', 'weekend', 100, 12),
    row('2026-10-01T17:00:00Z', 'midweek', 74, null),
    row('2026-10-02T17:00:00Z', 'separate', 181, 43),
    // Created ahead, not held yet: not in the file.
    row('2026-11-19T18:00:00Z', 'midweek', null, null),
  ]

  it('lists every meeting held, oldest first, with its two counts and its total once complete', async () => {
    const workbook = await read(await buildAttendanceXlsx({ meetings, serviceYear: 2026, timeZone: PARIS, now: NOW }))
    const sheet = workbook.worksheets[0]

    expect(sheet?.rowCount).toBe(5)
    expect(sheet?.getRow(2).values).toEqual([undefined, '03/09/2026', 'Réunion de semaine', 70, 15, 85])
    // Incomplete: the hall count, no online count and no total — empty cells, never zeros.
    expect(sheet?.getRow(4).getCell(3).value).toBe(74)
    expect(sheet?.getRow(4).getCell(4).value).toBeNull()
    expect(sheet?.getRow(4).getCell(5).value).toBeNull()
    // A name is data, never a formula someone's spreadsheet would run.
    expect(String(sheet?.getRow(5).getCell(2).value)).toMatch(ESCAPED)
  })

  it('sums the year up month by month as the S-88 does, with the year’s average at the foot', async () => {
    const workbook = await read(await buildAttendanceXlsx({ meetings, serviceYear: 2026, timeZone: PARIS, now: NOW }))
    const summary = workbook.worksheets[1]

    expect(summary?.rowCount).toBe(14)
    // Septembre: 1 midweek meeting (85), 1 weekend (112).
    expect(summary?.getRow(2).values).toEqual([undefined, 'septembre 2026', 1, 85, 85, 1, 112, 112])
    // Octobre: the only complete meeting is counted apart, so neither kind has a figure.
    expect(summary?.getRow(3).values).toEqual([undefined, 'octobre 2026', 0, 0, undefined, 0, 0])
    expect(summary?.getRow(3).getCell(7).value).toBeNull()
    expect(summary?.getRow(14).getCell(4).value).toBe(85)
  })
})
