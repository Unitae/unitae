import excelJs from 'exceljs'
import { type AttendanceKind, countsInAverages } from '~/features/events/model/attendance-kind.type'
import { attendanceReport, type ReportFigures } from '~/features/events/model/attendance-report'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { escapeSpreadsheetFormula } from '~/shared/utils/escape-spreadsheet-formula'
import { formatEventDate } from '~/shared/utils/event-time'

interface ExportMeeting {
  name: string
  startDate: Date
  /** Local day, `YYYY-MM-DD`. */
  day: string
  kind: AttendanceKind
  inPerson: number | null
  online: number | null
}

const bold = { bold: true }

/** A kind's figures as three cells; « no meeting » leaves the average empty rather than writing a zero. */
const cells = (figures: ReportFigures) => [figures.count, figures.total, figures.average ?? undefined]

/**
 * The service year as a spreadsheet: every meeting held, oldest first, with its two counts and its total once
 * complete; then the year summed up month by month as the S-88 card does, with the year's averages at the foot.
 * Meetings created ahead and not held yet are left out. Names are written as text, never as formulas.
 */
export async function buildAttendanceXlsx(input: {
  meetings: ExportMeeting[]
  serviceYear: number
  timeZone: string
  now: Date
}): Promise<Buffer> {
  const locale = getLocale()
  const held = input.meetings
    .filter(meeting => meeting.startDate.getTime() <= input.now.getTime())
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
  const workbook = new excelJs.Workbook()

  const list = workbook.addWorksheet(m.attendance_xlsx_meetings_sheet())
  list.columns = [
    { header: m.attendance_xlsx_col_date(), width: 12 },
    { header: m.attendance_xlsx_col_meeting(), width: 28 },
    { header: m.attendance_xlsx_col_in_person(), width: 10 },
    { header: m.attendance_xlsx_col_online(), width: 10 },
    { header: m.attendance_xlsx_col_total(), width: 10 },
  ]
  list.getRow(1).font = bold
  for (const meeting of held) {
    const total = meeting.inPerson != null && meeting.online != null ? meeting.inPerson + meeting.online : undefined
    list.addRow([
      formatEventDate(meeting.startDate, input.timeZone, locale, { day: '2-digit', month: '2-digit', year: 'numeric' }),
      escapeSpreadsheetFormula(meeting.name),
      meeting.inPerson ?? undefined,
      meeting.online ?? undefined,
      total,
    ])
  }

  const report = attendanceReport(
    held.filter(meeting => countsInAverages(meeting.kind)),
    input.serviceYear,
  )
  const summary = workbook.addWorksheet(m.attendance_xlsx_summary_sheet())
  summary.columns = [
    { header: m.attendance_xlsx_col_month(), width: 18 },
    { header: m.attendance_xlsx_col_midweek_count(), width: 14 },
    { header: m.attendance_xlsx_col_midweek_total(), width: 14 },
    { header: m.attendance_xlsx_col_midweek_average(), width: 14 },
    { header: m.attendance_xlsx_col_weekend_count(), width: 14 },
    { header: m.attendance_xlsx_col_weekend_total(), width: 14 },
    { header: m.attendance_xlsx_col_weekend_average(), width: 14 },
  ]
  summary.getRow(1).font = bold
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
  for (const month of report.months) {
    summary.addRow([
      monthName.format(new Date(Date.UTC(month.year, month.month, 1))),
      ...cells(month.midweek),
      ...cells(month.weekend),
    ])
  }
  summary.addRow([m.attendance_xlsx_year(), ...cells(report.year.midweek), ...cells(report.year.weekend)]).font = bold

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
