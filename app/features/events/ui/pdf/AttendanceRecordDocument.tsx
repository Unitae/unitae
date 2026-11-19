import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReportFigures, ReportMonth } from '~/features/events/model/attendance-report'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { PdfDemoMark } from '~/shared/ui/pdf-demo-mark'
import { PDF_SERIF_FAMILY, registerPdfFonts } from '~/shared/ui/pdf-fonts'
import { sanitizeText } from '~/shared/utils/sanitize-text'

registerPdfFonts()

const INK = '#000000'
const RULE = '#000000'

export interface AttendanceRecordYear {
  /** Its first year: 2026 for 2026–2027. */
  serviceYear: number
  months: ReportMonth[]
  year: { midweek: ReportFigures; weekend: ReportFigures }
}

interface AttendanceRecordDocumentProps {
  /** The year before and the year shown, side by side as on the printed card. */
  years: [AttendanceRecordYear, AttendanceRecordYear]
}

const yearLabel = (serviceYear: number) => `${serviceYear}–${serviceYear + 1}`
// Headings wrap between words, never inside one (« Assistance moy-enne »).
const wholeWords = (word: string) => [word]
// « Septembre », as the card writes its months.
const capitalised = (text: string) => text.charAt(0).toLocaleUpperCase(getLocale()) + text.slice(1)
const cell = (value: number | null) => (value == null || value === 0 ? '' : String(value))

/** One service year of one kind, as a box of the card: its months, then the year's average. */
function YearTable({
  serviceYear,
  months,
  figures,
  year,
  first,
}: {
  serviceYear: number
  months: ReportMonth[]
  figures: (month: ReportMonth) => ReportFigures
  year: ReportFigures
  first: boolean
}) {
  const monthName = new Intl.DateTimeFormat(getLocale(), { month: 'long', timeZone: 'UTC' })
  return (
    <View style={[styles.table, first ? {} : styles.secondTable]}>
      <View style={[styles.row, styles.headerRow]}>
        <View style={[styles.monthCell, styles.headerCell]}>
          <Text style={styles.headerYear} hyphenationCallback={wholeWords}>
            {m.attendance_record_col_year()}
          </Text>
          <Text style={styles.yearValue}>{yearLabel(serviceYear)}</Text>
        </View>
        {[m.attendance_record_col_meetings(), m.attendance_record_col_total(), m.attendance_record_col_average()].map(
          (label, index) => (
            <View key={label} style={[styles.numberCell, styles.headerCell, index === 2 ? styles.lastCell : {}]}>
              <Text style={styles.headerText} hyphenationCallback={wholeWords}>
                {label}
              </Text>
            </View>
          ),
        )}
      </View>
      {months.map(month => {
        const value = figures(month)
        return (
          <View key={`${month.year}-${month.month}`} style={styles.row}>
            <View style={styles.monthCell}>
              <Text style={styles.month}>
                {sanitizeText(capitalised(monthName.format(new Date(Date.UTC(month.year, month.month, 1)))))}
              </Text>
            </View>
            <View style={styles.numberCell}>
              <Text style={styles.number}>{cell(value.count)}</Text>
            </View>
            <View style={styles.numberCell}>
              <Text style={styles.number}>{cell(value.total)}</Text>
            </View>
            <View style={[styles.numberCell, styles.lastCell]}>
              <Text style={styles.number}>{cell(value.average)}</Text>
            </View>
          </View>
        )
      })}
      <View style={[styles.row, styles.footRow]}>
        <View style={styles.footLabelCell}>
          <Text style={styles.footLabel}>{m.attendance_record_year_average()}</Text>
        </View>
        <View style={[styles.numberCell, styles.lastCell]}>
          <Text style={[styles.number, styles.footValue]}>{cell(year.average)}</Text>
        </View>
      </View>
    </View>
  )
}

/**
 * The congregation meeting attendance record, laid out as the printed S-88 card: the midweek meeting, then the
 * weekend meeting, each with two service years side by side — the year before on the left — month by month: meetings
 * counted, total attendance, average attendance; and the year's average at the foot. Only complete meetings count.
 */
export function AttendanceRecordDocument({ years }: AttendanceRecordDocumentProps) {
  const kinds = [
    { title: m.attendance_kind_midweek_full(), pick: (f: AttendanceRecordYear['year']) => f.midweek, kind: 'midweek' },
    { title: m.attendance_kind_weekend_full(), pick: (f: AttendanceRecordYear['year']) => f.weekend, kind: 'weekend' },
  ] as const
  return (
    <Document title={m.attendance_record_title()}>
      <Page size="A4" orientation="portrait" style={styles.page}>
        <Text style={styles.title}>{m.attendance_record_title().toLocaleUpperCase(getLocale())}</Text>
        {kinds.map(({ title, pick, kind }) => (
          <View key={kind} style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <View style={styles.pair}>
              {years.map((year, index) => (
                <YearTable
                  key={year.serviceYear}
                  serviceYear={year.serviceYear}
                  months={year.months}
                  figures={month => month[kind]}
                  year={pick(year.year)}
                  first={index === 0}
                />
              ))}
            </View>
          </View>
        ))}
        {/* The card's own reference, bottom left: the sheet is laid out exactly as it. */}
        <Text style={styles.formReference} fixed>
          {m.attendance_record_form_reference()}
        </Text>
        <PdfDemoMark />
      </Page>
    </Document>
  )
}

const BORDER = { borderColor: RULE, borderStyle: 'solid' as const }

const styles = StyleSheet.create({
  page: { paddingVertical: 36, paddingHorizontal: 32, fontFamily: PDF_SERIF_FAMILY, fontSize: 10, color: INK },
  title: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 18 },
  section: { marginBottom: 26 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 5 },
  pair: { flexDirection: 'row' },
  table: { flex: 1, ...BORDER, borderWidth: 1 },
  secondTable: { borderLeftWidth: 0 },
  row: { flexDirection: 'row', ...BORDER, borderBottomWidth: 0.75, minHeight: 18.5 },
  headerRow: { minHeight: 30 },
  footRow: { borderBottomWidth: 0 },
  monthCell: { width: '34%', ...BORDER, borderRightWidth: 0.75, justifyContent: 'center', paddingHorizontal: 3 },
  numberCell: { width: '22%', ...BORDER, borderRightWidth: 0.75, justifyContent: 'center', paddingHorizontal: 3 },
  lastCell: { borderRightWidth: 0 },
  headerCell: { justifyContent: 'flex-start', paddingTop: 2 },
  headerYear: { fontSize: 7.5, fontWeight: 'bold' },
  yearValue: { fontSize: 9, marginTop: 2 },
  headerText: { fontSize: 7.5, fontWeight: 'bold', textAlign: 'center' },
  month: { fontSize: 10 },
  number: { fontSize: 10, textAlign: 'right' },
  footLabelCell: {
    width: '78%',
    ...BORDER,
    borderRightWidth: 0.75,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  footLabel: { fontSize: 9.5, fontWeight: 'bold', textAlign: 'center' },
  footValue: { fontWeight: 'bold' },
  formReference: { position: 'absolute', bottom: 24, left: 32, fontSize: 6.5 },
})
