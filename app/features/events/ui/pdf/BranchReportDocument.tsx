import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { PdfDemoMark } from '~/shared/ui/pdf-demo-mark'
import { PDF_FONT_FAMILY, registerPdfFonts } from '~/shared/ui/pdf-fonts'
import { sanitizeText } from '~/shared/utils/sanitize-text'

registerPdfFonts()

const INK = '#000000'
const SHADE = '#808080'
const DOTS = '#444444'

interface BranchLineFigures {
  reports: number
  studies: number
  hours?: number
}

export interface BranchReportDocumentProps {
  congregationName: string
  /** 0 = January. */
  month: number
  year: number
  publishers: BranchLineFigures
  auxiliary: BranchLineFigures
  regular: BranchLineFigures
  activePublishers: number
  /** Null when the reader may not see attendance, or no weekend meeting of the month is complete: left blank. */
  weekendAverage: number | null
}

// Headings wrap between words, never inside one.
const wholeWords = (word: string) => [word]
const capitalised = (text: string) => text.charAt(0).toLocaleUpperCase(getLocale()) + text.slice(1)

/** A line of the form: its label, then the three figures; the publishers' hours box is shaded, as printed. */
function LineRow({ label, figures, last = false }: { label: string; figures: BranchLineFigures; last?: boolean }) {
  return (
    <View style={[styles.row, last ? {} : styles.rowRule]}>
      <View style={styles.labelCell}>
        <Text style={styles.cellText}>{label}</Text>
      </View>
      <View style={[styles.numberCell, styles.reportsCell]}>
        <Text style={styles.number}>{String(figures.reports)}</Text>
      </View>
      <View style={styles.numberCell}>
        <Text style={styles.number}>{String(figures.studies)}</Text>
      </View>
      <View style={[styles.numberCell, styles.lastCell, figures.hours == null ? styles.shaded : {}]}>
        {figures.hours != null && <Text style={styles.number}>{String(figures.hours)}</Text>}
      </View>
    </View>
  )
}

/** The S-1, « Activité de prédication et assistance aux réunions de l’assemblée locale », filled in for one month. */
export function BranchReportDocument(props: BranchReportDocumentProps) {
  const period = capitalised(
    new Intl.DateTimeFormat(getLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(props.year, props.month, 1)),
    ),
  )
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title} hyphenationCallback={wholeWords}>
          {m.branch_report_pdf_title()}
        </Text>

        <View style={styles.dottedLine}>
          <Text style={styles.filled}>{sanitizeText(props.congregationName)}</Text>
        </View>
        <View style={styles.captions}>
          <Text style={[styles.caption, { width: '50%' }]}>{m.branch_report_pdf_congregation_name()}</Text>
          <Text style={[styles.caption, { width: '25%' }]}>{m.branch_report_pdf_city()}</Text>
          <Text style={[styles.caption, { width: '25%' }]}>{m.branch_report_pdf_region()}</Text>
        </View>

        <View style={styles.periodLine}>
          <View style={styles.periodField}>
            <Text style={styles.fieldLabel}>{m.branch_report_pdf_report_for()} </Text>
            <View style={styles.periodBlank}>
              <View style={styles.inlineDots}>
                <Text style={styles.filled}>{sanitizeText(period)}</Text>
              </View>
              <Text style={styles.caption}>{m.branch_report_pdf_month_and_year()}</Text>
            </View>
          </View>
          <View style={styles.numberField}>
            <Text style={styles.fieldLabel}>{m.branch_report_pdf_number()} </Text>
            <View style={[styles.inlineDots, { flexGrow: 1 }]} />
          </View>
        </View>

        <View style={styles.table}>
          <View style={[styles.row, styles.rowRule]}>
            <View style={styles.labelCell} />
            {[m.branch_report_pdf_reports(), m.branch_report_pdf_studies(), m.branch_report_pdf_hours()].map(
              (label, index) => (
                <View
                  key={label}
                  style={[styles.numberCell, index === 0 ? styles.reportsCell : {}, index === 2 ? styles.lastCell : {}]}
                >
                  <Text style={styles.header} hyphenationCallback={wholeWords}>
                    {label}
                  </Text>
                </View>
              ),
            )}
          </View>
          <LineRow label={m.branch_report_pdf_publishers()} figures={props.publishers} />
          <LineRow label={m.branch_report_pdf_auxiliary()} figures={props.auxiliary} />
          <LineRow label={m.branch_report_pdf_regular()} figures={props.regular} last />
        </View>

        <View style={styles.boxes}>
          <View style={[styles.box, { width: 200 }]}>
            <View style={styles.boxLabel}>
              <Text style={styles.boxText} hyphenationCallback={wholeWords}>
                {m.branch_report_pdf_active()}
              </Text>
            </View>
            <View style={styles.boxValue}>
              <Text style={styles.number}>{String(props.activePublishers)}</Text>
            </View>
          </View>
          <View style={[styles.box, { width: 250, marginLeft: 28 }]}>
            <View style={styles.boxLabel}>
              <Text style={styles.boxText} hyphenationCallback={wholeWords}>
                {m.branch_report_pdf_weekend_average()}
              </Text>
            </View>
            <View style={styles.boxValue}>
              {props.weekendAverage != null && <Text style={styles.number}>{String(props.weekendAverage)}</Text>}
            </View>
          </View>
        </View>

        <View style={styles.signature}>
          <View style={styles.signatureDots} />
          <Text style={styles.caption}>{m.branch_report_pdf_secretary()}</Text>
        </View>

        <Text style={styles.formName}>{m.branch_report_pdf_form_name()}</Text>
        <PdfDemoMark />
      </Page>
    </Document>
  )
}

const styles = StyleSheet.create({
  page: { paddingVertical: 36, paddingHorizontal: 42, fontFamily: PDF_FONT_FAMILY, color: INK },
  title: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 28 },
  dottedLine: { borderBottomWidth: 0.8, borderBottomColor: DOTS, borderBottomStyle: 'dotted', minHeight: 18 },
  filled: { fontSize: 12, paddingLeft: 4, paddingBottom: 2 },
  captions: { flexDirection: 'row', marginTop: 2 },
  caption: { fontSize: 10, textAlign: 'center' },
  periodLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, marginBottom: 14 },
  periodField: { flexDirection: 'row', alignItems: 'flex-start', width: '52%' },
  periodBlank: { flexGrow: 1 },
  fieldLabel: { fontSize: 13, paddingTop: 2 },
  inlineDots: { borderBottomWidth: 0.8, borderBottomColor: DOTS, borderBottomStyle: 'dotted', minHeight: 18 },
  numberField: { flexDirection: 'row', alignItems: 'flex-start', width: '42%' },
  table: { width: '72%', borderWidth: 1.6, borderColor: INK },
  row: { flexDirection: 'row', minHeight: 36 },
  rowRule: { borderBottomWidth: 0.8, borderBottomColor: INK },
  labelCell: { width: '31%', borderRightWidth: 0.8, borderRightColor: INK, justifyContent: 'center', paddingLeft: 10 },
  numberCell: {
    width: '22%',
    borderRightWidth: 0.8,
    borderRightColor: INK,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  // « Nombre de fiches d’activité », the longest heading: wide enough to break between its words only.
  reportsCell: { width: '25%' },
  lastCell: { borderRightWidth: 0 },
  shaded: { backgroundColor: SHADE },
  header: { fontSize: 12, textAlign: 'center' },
  cellText: { fontSize: 12 },
  number: { fontSize: 13 },
  boxes: { flexDirection: 'row', marginTop: 20 },
  box: { flexDirection: 'row', borderWidth: 1.6, borderColor: INK, minHeight: 40 },
  boxLabel: { width: '58%', borderRightWidth: 0.8, borderRightColor: INK, justifyContent: 'center', paddingLeft: 8 },
  boxText: { fontSize: 10.5 },
  boxValue: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  signature: { marginTop: 34, marginLeft: '40%' },
  signatureDots: { borderBottomWidth: 0.8, borderBottomColor: DOTS, borderBottomStyle: 'dotted', height: 18 },
  formName: { fontSize: 10, marginTop: 8 },
})
