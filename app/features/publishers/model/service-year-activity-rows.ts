import { serviceYearMonths } from '~/features/publishers/model/pioneer-pace'
import { PublisherType } from '~/shared/types/publisher-type'

export interface ServiceYearActivityRow {
  year: number
  month: number
  hours: number | null
  isPublisher: boolean
  studies: number | null
  type: PublisherType
  notes: string | null
}

type ReportLike = Pick<ServiceYearActivityRow, 'year' | 'month'> & Partial<ServiceYearActivityRow>

const EMPTY_ROW = {
  hours: null,
  isPublisher: false,
  studies: null,
  type: PublisherType.Normal,
  notes: null,
} as const

// The twelve S-21 rows of a service year, September first. The year is the caller's: it must
// never be inferred from the reports, or a publisher whose first report falls after December
// prints on the wrong sheet.
export function buildServiceYearActivityRows(reports: ReportLike[], serviceYear: number): ServiceYearActivityRow[] {
  return serviceYearMonths(serviceYear).map(({ month, year }) => {
    const report = reports.find(candidate => candidate.month === month && candidate.year === year)
    return {
      year,
      month,
      hours: report?.hours ?? EMPTY_ROW.hours,
      isPublisher: report?.isPublisher ?? EMPTY_ROW.isPublisher,
      studies: report?.studies ?? EMPTY_ROW.studies,
      type: report?.type ?? EMPTY_ROW.type,
      notes: report?.notes ?? EMPTY_ROW.notes,
    }
  })
}
