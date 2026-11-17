import { describe, expect, it } from 'vitest'
import { filenameFromDisposition } from './download-file'

describe('filenameFromDisposition', () => {
  it('reads the announced file name, quoted or not', () => {
    expect(filenameFromDisposition('attachment; filename="assistance-2026-2027.pdf"')).toBe('assistance-2026-2027.pdf')
    expect(filenameFromDisposition('attachment; filename=report.xlsx')).toBe('report.xlsx')
    expect(filenameFromDisposition('inline')).toBeNull()
  })
})
