import { serviceYearMonths } from '~/features/publishers/model/pioneer-pace'
import { PublisherType } from '~/shared/types/publisher-type'

// One S-21 row. `studies` and `notes` are null only for a month with no report filed: a filed
// report always carries a number and a string, and the sheet prints a filed 0 while leaving an
// unfiled month blank.
export interface ServiceYearActivityRow {
  year: number
  month: number
  hours: number | null
  isPublisher: boolean
  studies: number | null
  type: PublisherType
  notes: string | null
}

type Report = Pick<ServiceYearActivityRow, 'year' | 'month' | 'hours' | 'isPublisher' | 'studies' | 'type' | 'notes'>

const EMPTY_ROW = {
  hours: null,
  isPublisher: false,
  studies: null,
  type: PublisherType.Normal,
  notes: null,
} as const

// The twelve S-21 rows of a service year, September first. The year is the caller's: it must
// never be inferred from the reports, or a publisher whose first report falls in January–August
// (the second calendar year of the service year) prints on the wrong sheet. Reports outside the
// year are ignored. One report per month is assumed; with duplicates the first one wins.
export function buildServiceYearActivityRows(reports: Report[], serviceYear: number): ServiceYearActivityRow[] {
  return serviceYearMonths(serviceYear).map(({ month, year }) => {
    const report = reports.find(candidate => candidate.month === month && candidate.year === year)
    if (report == null) return { year, month, ...EMPTY_ROW }
    const { hours, isPublisher, studies, type, notes } = report
    return { year, month, hours, isPublisher, studies, type, notes }
  })
}
