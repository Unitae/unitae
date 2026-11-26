import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { StudentSlip } from '~/features/events/model/student-slip'
import * as m from '~/i18n/paraglide/messages'
import { PdfDemoMark } from '~/shared/ui/pdf-demo-mark'
import { PDF_FONT_FAMILY, PDF_SERIF_FAMILY, registerPdfFonts } from '~/shared/ui/pdf-fonts'
import { sanitizeText } from '~/shared/utils/sanitize-text'

registerPdfFonts()

// The S-89 is printed on a card of this size, not on A4.
const PAGE_WIDTH = 240.9
const PAGE_HEIGHT = 320.3

const wholeWords = (word: string) => [word]

interface StudentSlipDocumentProps {
  slip: StudentSlip
}

/** The S-89 assignment slip: the form's fields filled in, its boxes ticked, its printed texts in the reader's language. */
export function StudentSlipDocument({ slip }: StudentSlipDocumentProps) {
  const rooms = [m.slip_room_main(), m.slip_room_second(), m.slip_room_third()]

  return (
    <Document>
      <Page size={[PAGE_WIDTH, PAGE_HEIGHT]} style={styles.page}>
        <Text style={styles.title} hyphenationCallback={wholeWords}>
          {m.slip_title_line_1()}
        </Text>
        <Text style={styles.title} hyphenationCallback={wholeWords}>
          {m.slip_title_line_2()}
        </Text>

        <Field label={m.slip_name_label()} value={slip.name} />
        <Field label={m.slip_assistant_label()} value={slip.assistant} />
        <Field label={m.slip_date_label()} value={slip.date} />
        <Field label={m.slip_part_label()} value={slip.partNumber == null ? null : String(slip.partNumber)} />

        <Text style={styles.roomsLabel} hyphenationCallback={wholeWords}>
          {m.slip_rooms_label()}
        </Text>
        {rooms.map((label, index) => (
          <View key={label} style={styles.roomRow}>
            <View style={styles.box}>{slip.room === index && <View style={styles.tick} />}</View>
            <Text style={styles.roomText} hyphenationCallback={wholeWords}>
              {label}
            </Text>
          </View>
        ))}

        <Text style={styles.note} hyphenationCallback={wholeWords}>
          <Text style={styles.bold}>{sanitizeText(m.slip_note_label())} </Text>
          {emphasised(m.slip_note_body())}
        </Text>

        <Text style={styles.code}>{m.slip_form_code()}</Text>
        <PdfDemoMark />
      </Page>
    </Document>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label} hyphenationCallback={wholeWords}>
        {label}
      </Text>
      <View style={styles.line}>
        <Text style={styles.value} hyphenationCallback={wholeWords}>
          {value == null ? '' : sanitizeText(value)}
        </Text>
      </View>
    </View>
  )
}

/** A text where « *…* » marks what the form sets in italics: the titles of the books it names. */
function emphasised(text: string) {
  return sanitizeText(text)
    .split('*')
    .map((segment, index) => (
      <Text key={`${segment}`} style={index % 2 === 1 ? styles.italic : undefined}>
        {segment}
      </Text>
    ))
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 18,
    fontFamily: PDF_FONT_FAMILY,
    color: '#000000',
  },
  title: {
    fontSize: 10.5,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 1.25,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 9,
  },
  label: {
    fontSize: 10.5,
    fontWeight: 'bold',
    marginRight: 4,
  },
  line: {
    flexGrow: 1,
    borderBottomWidth: 0.8,
    borderBottomStyle: 'dashed',
    borderBottomColor: '#000000',
    minHeight: 14,
    justifyContent: 'flex-end',
  },
  value: {
    fontFamily: PDF_SERIF_FAMILY,
    fontSize: 10,
  },
  roomsLabel: {
    fontSize: 10.5,
    fontWeight: 'bold',
    marginTop: 14,
    marginBottom: 4,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    marginTop: 3,
  },
  box: {
    width: 8,
    height: 8,
    borderWidth: 0.8,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  tick: {
    width: 4,
    height: 4,
    backgroundColor: '#000000',
  },
  roomText: {
    fontSize: 10,
  },
  note: {
    fontSize: 8.5,
    lineHeight: 1.3,
    marginTop: 14,
  },
  bold: {
    fontWeight: 'bold',
  },
  italic: {
    fontStyle: 'italic',
  },
  code: {
    position: 'absolute',
    left: 18,
    bottom: 12,
    fontSize: 6.5,
  },
})
