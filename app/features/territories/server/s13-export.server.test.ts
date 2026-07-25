import { describe, expect, it } from 'vitest'
import { generateS13ExportExcel } from './s13-export.server'

type TerritoryData = Parameters<typeof generateS13ExportExcel>[0][number]

function territory(overrides: Partial<TerritoryData>): TerritoryData {
  return {
    id: 1,
    number: 'T-01',
    name: null,
    description: null,
    type: 'DOORS_TO_DOORS',
    // biome-ignore lint/suspicious/noExplicitAny: exceljs export data shape varies with schema; overrides fill gaps
    attributions: [] as any,
    ...overrides,
  } as TerritoryData
}

describe('generateS13ExportExcel', () => {
  it('produces a workbook with a worksheet named for the service year', async () => {
    const wb = generateS13ExportExcel([], '2025-2026')
    const ws = wb.getWorksheet('2025-2026')
    expect(ws).toBeDefined()
  })

  it('mentions the service year somewhere in the header block', async () => {
    const wb = generateS13ExportExcel([], '2025-2026')
    const ws = wb.getWorksheet('2025-2026')
    if (!ws) throw new Error('no worksheet')
    // The service year appears on one of the header rows; assert it shows up
    // anywhere in the workbook rather than pinning to a specific row.
    let seenYear = false
    ws.eachRow(row => {
      row.eachCell(cell => {
        if (String(cell.value ?? '').includes('2025-2026')) seenYear = true
      })
    })
    expect(seenYear).toBe(true)
  })

  it('writes rows for every territory in the input', async () => {
    const wb = generateS13ExportExcel(
      [territory({ id: 1, number: 'T-01' }), territory({ id: 2, number: 'T-02' })],
      '2025-2026',
    )
    const ws = wb.getWorksheet('2025-2026')
    if (!ws) throw new Error('no worksheet')

    // Find the cells containing T-01 and T-02 anywhere in the sheet.
    let seenT01 = false
    let seenT02 = false
    ws.eachRow(row => {
      row.eachCell(cell => {
        const v = String(cell.value ?? '')
        if (v.includes('T-01')) seenT01 = true
        if (v.includes('T-02')) seenT02 = true
      })
    })
    expect(seenT01).toBe(true)
    expect(seenT02).toBe(true)
  })

  it('does not throw on an empty input list', () => {
    expect(() => generateS13ExportExcel([], '2025-2026')).not.toThrow()
  })

  it('escapes a territory number that starts with a formula-trigger character', () => {
    const wb = generateS13ExportExcel([territory({ id: 1, number: '=SUM(A1:A2)' })], '2025-2026')
    const ws = wb.getWorksheet('2025-2026')
    if (!ws) throw new Error('no worksheet')

    const values: string[] = []
    ws.eachRow(row => row.eachCell(cell => values.push(String(cell.value ?? ''))))
    expect(values).toContain("'=SUM(A1:A2)")
    expect(values).not.toContain('=SUM(A1:A2)')
  })

  it('escapes a publisher name that starts with a formula-trigger character', () => {
    const wb = generateS13ExportExcel(
      [
        territory({
          id: 1,
          number: 'T-01',
          // biome-ignore lint/suspicious/noExplicitAny: exceljs export data shape varies with schema
          attributions: [
            { startDate: new Date('2025-09-01'), endDate: null, publisher: { firstname: '=cmd', lastname: 'X' } },
          ] as any,
        }),
      ],
      '2025-2026',
    )
    const ws = wb.getWorksheet('2025-2026')
    if (!ws) throw new Error('no worksheet')

    const values: string[] = []
    ws.eachRow(row => row.eachCell(cell => values.push(String(cell.value ?? ''))))
    expect(values).toContain("'=cmd X")
  })
})
