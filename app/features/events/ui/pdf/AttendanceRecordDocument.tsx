import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReportFigures, ReportMonth } from '~/features/events/model/attendance-report'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { PDF_FONT_FAMILY, registerPdfFonts } from '~/shared/ui/pdf-fonts'
import { sanitizeText } from '~/shared/utils/sanitize-text'

registerPdfFonts()

const INK = '#1a1d21'
const MUTED = '#5f6670'
const RULE = '#c9ced4'
const SHADE = '#f1f3f5'

export interface AttendanceRecordYear {
  /** Its first year: 2026 for 2026–2027. */
  serviceYear: number
  months: ReportMonth[]
  year: { midweek: ReportFigures; weekend: ReportFigures }
}

interface AttendanceRecordDocumentProps {
  congregationName: string
  /** The year before and the year shown, side by side as on the printed card. */
  years: [AttendanceRecordYear, AttendanceRecordYear]
}

const yearLabel = (serviceYear: number) => `${serviceYear}–${serviceYear + 1}`
// Headings wrap between words, never inside one (« Moyenne par réu-nion »).
const wholeWords = (word: string) => [word]

function KindTable({
  title,
  months,
  figures,
  year,
}: {
  title: string
  months: ReportMonth[]
  figures: (month: ReportMonth) => ReportFigures
  year: ReportFigures
}) {
  const monthName = new Intl.DateTimeFormat(getLocale(), { month: 'long', timeZone: 'UTC' })
  const cell = (value: number | null) => (value == null || value === 0 ? '' : String(value))
  return (
    <View style={styles.table} wrap={false}>
      <Text style={styles.tableTitle}>{sanitizeText(title)}</Text>
      <View style={[styles.row, styles.headerRow]}>
        <Text style={[styles.month, styles.header]} hyphenationCallback={wholeWords}>
          {m.attendance_record_col_month()}
        </Text>
        <Text style={[styles.number, styles.header]} hyphenationCallback={wholeWords}>
          {m.attendance_record_col_meetings()}
        </Text>
        <Text style={[styles.number, styles.header]} hyphenationCallback={wholeWords}>
          {m.attendance_record_col_total()}
        </Text>
        <Text style={[styles.number, styles.header]} hyphenationCallback={wholeWords}>
          {m.attendance_record_col_average()}
        </Text>
      </View>
      {months.map(month => {
        const value = figures(month)
        return (
          <View key={`${month.year}-${month.month}`} style={styles.row}>
            <Text style={styles.month}>{monthName.format(new Date(Date.UTC(month.year, month.month, 1)))}</Text>
            <Text style={styles.number}>{cell(value.count)}</Text>
            <Text style={styles.number}>{cell(value.total)}</Text>
            <Text style={styles.number}>{cell(value.average)}</Text>
          </View>
        )
      })}
      <View style={[styles.row, styles.footRow]}>
        <Text style={[styles.month, styles.foot]}>{m.attendance_record_year_average()}</Text>
        <Text style={styles.number}>{cell(year.count)}</Text>
        <Text style={styles.number}>{cell(year.total)}</Text>
        <Text style={[styles.number, styles.foot]}>{cell(year.average)}</Text>
      </View>
    </View>
  )
}

/**
 * The congregation meeting attendance record, laid out as the printed S-88 card: two service years side by side, the
 * year before on the left; each with its midweek and weekend meetings month by month — meetings counted, total
 * attendance, average per meeting — and the year's average at the foot. Only complete meetings count.
 */
export function AttendanceRecordDocument({ congregationName, years }: AttendanceRecordDocumentProps) {
  return (
    <Document title={m.attendance_record_title()}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.masthead}>
          <Text style={styles.title}>{m.attendance_record_title()}</Text>
          <Text style={styles.congregation}>{sanitizeText(congregationName)}</Text>
        </View>
        <View style={styles.years}>
          {years.map(year => (
            <View key={year.serviceYear} style={styles.year}>
              <Text style={styles.yearTitle}>{m.attendance_year({ label: yearLabel(year.serviceYear) })}</Text>
              <KindTable
                title={m.attendance_kind_midweek_full()}
                months={year.months}
                figures={month => month.midweek}
                year={year.year.midweek}
              />
              <KindTable
                title={m.attendance_kind_weekend_full()}
                months={year.months}
                figures={month => month.weekend}
                year={year.year.weekend}
              />
            </View>
          ))}
        </View>
      </Page>
    </Document>
  )
}

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: PDF_FONT_FAMILY, fontSize: 8, color: INK },
  masthead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingBottom: 6,
    marginBottom: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: INK,
  },
  title: { fontSize: 14, fontWeight: 'bold' },
  congregation: { fontSize: 10, color: MUTED },
  years: { flexDirection: 'row', gap: 24 },
  year: { flex: 1, flexDirection: 'column', gap: 8 },
  yearTitle: { fontSize: 11, fontWeight: 'bold' },
  table: { flexDirection: 'column' },
  tableTitle: { fontSize: 9, fontWeight: 'bold', marginBottom: 3 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: RULE, paddingVertical: 2 },
  headerRow: { backgroundColor: SHADE, borderBottomColor: INK },
  footRow: { borderTopWidth: 1, borderTopColor: INK, borderBottomWidth: 0 },
  header: { fontWeight: 'bold', color: MUTED },
  foot: { fontWeight: 'bold' },
  month: { flex: 2, paddingLeft: 3 },
  number: { flex: 1, textAlign: 'right', paddingRight: 3 },
})
