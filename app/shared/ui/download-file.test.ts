import { describe, expect, it } from 'vitest'
import { filenameFromDisposition } from './download-file'

describe('filenameFromDisposition', () => {
  it('reads the announced file name, quoted or not', () => {
    expect(filenameFromDisposition('attachment; filename="assistance-2026-2027.pdf"')).toBe('assistance-2026-2027.pdf')
    expect(filenameFromDisposition('attachment; filename=report.xlsx')).toBe('report.xlsx')
    expect(filenameFromDisposition('inline')).toBeNull()
  })

  it('prefers the UTF-8 name over its ASCII stand-in', () => {
    const header = `attachment; filename="S-21-____.pdf"; filename*=UTF-8''S-21-%D0%9E%D0%BB%D0%B5%D0%B3.pdf`
    expect(filenameFromDisposition(header)).toBe('S-21-Олег.pdf')
  })

  it('falls back on the ASCII name when the UTF-8 one does not decode', () => {
    expect(filenameFromDisposition(`attachment; filename="a.pdf"; filename*=UTF-8''%E0%A4%A.pdf`)).toBe('a.pdf')
  })
})
