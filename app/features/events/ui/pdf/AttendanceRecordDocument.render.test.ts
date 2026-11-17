import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { attendanceReport } from '~/features/events/model/attendance-report'
import { renderPdfResponse } from '~/shared/infra/pdf.server'
import { readPdf } from '~/tests/helpers/pdf-text'
import { AttendanceRecordDocument } from './AttendanceRecordDocument'

const meetings = [
  { day: '2025-09-04', kind: 'midweek' as const, inPerson: 66, online: 14 },
  { day: '2026-09-03', kind: 'midweek' as const, inPerson: 70, online: 15 },
  { day: '2026-09-06', kind: 'weekend' as const, inPerson: 100, online: 12 },
]

describe('AttendanceRecordDocument', () => {
  // What the card prints: both years on one landscape page, each month, the figures and the year's average.
  it('prints the card on one portrait page: each meeting with its two years side by side, and their figures', async () => {
    const response = await renderPdfResponse(
      createElement(AttendanceRecordDocument, {
        years: [
          { serviceYear: 2025, ...attendanceReport(meetings.slice(0, 1), 2025) },
          { serviceYear: 2026, ...attendanceReport(meetings.slice(1), 2026) },
        ],
      }) as unknown as Parameters<typeof renderPdfResponse>[0],
      'assistance.pdf',
    )
    const pages = await readPdf(await response.arrayBuffer())
    const text = pages[0]?.items.map(item => item.str).join(' ') ?? ''

    expect(pages).toHaveLength(1)
    expect(text).toContain('RELEVÉ DE L’ASSISTANCE AUX RÉUNIONS DE L’ASSEMBLÉE')
    expect(text).toContain('2025–2026')
    expect(text).toContain('2026–2027')
    expect(text).toContain('Septembre')
    expect(text).toContain('S-88-F 12/18')
    expect(text).toContain('85')
    expect(text).toContain('112')
  })
})
