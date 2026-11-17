import { type AttendanceMeeting, monthlyStats, periodStats } from '~/features/events/model/attendance-stats'

/** One kind's figures as the S-88 prints them: meetings counted, their total attendance, the average per meeting. */
export interface ReportFigures {
  count: number
  total: number
  /** Whole number, half up; null without a meeting. */
  average: number | null
}

export interface ReportMonth {
  /** 0 = January. */
  month: number
  year: number
  midweek: ReportFigures
  weekend: ReportFigures
}

const figures = ({ count, total, average }: ReportFigures): ReportFigures => ({ count, total, average })

/**
 * A service year as the S-88 card and the spreadsheet report it: September to August, the midweek and weekend
 * meetings that are complete, month by month, and the year's average per meeting — its total over its meetings,
 * never an average of the monthly averages. Incomplete meetings and those counted apart (the Memorial) are left out.
 */
export function attendanceReport(
  meetings: AttendanceMeeting[],
  serviceYear: number,
): { months: ReportMonth[]; year: { midweek: ReportFigures; weekend: ReportFigures } } {
  return {
    months: monthlyStats(meetings, serviceYear).map(month => ({
      month: month.month,
      year: month.year,
      midweek: figures(month.midweek),
      weekend: figures(month.weekend),
    })),
    year: {
      midweek: figures(periodStats(meetings, 'midweek')),
      weekend: figures(periodStats(meetings, 'weekend')),
    },
  }
}
