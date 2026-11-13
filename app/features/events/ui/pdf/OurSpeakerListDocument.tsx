import { Document, type DocumentProps, Page, StyleSheet, Text, type TextProps, View } from '@react-pdf/renderer'
import type { PropsWithChildren, ReactElement } from 'react'
import type { OurListContact } from '~/features/events/model/our-speaker.type'
import {
  addressHalves,
  OUR_LIST_CELL_GAP,
  OUR_LIST_COLUMNS,
  OUR_LIST_MARGIN,
  OUR_LIST_TEXT_SIZE,
} from '~/features/events/model/our-speaker-sheet'
import * as m from '~/i18n/paraglide/messages'
import { sanitizeText } from '~/shared/utils/sanitize-text'

// « Notre liste » as the other congregations receive it: our congregation and the day, the two people to call
// (coordinator, public talk coordinator), then one row per brother with what we share of him. It reads like the board
// sheets — black type and rules, no boxes — since it is printed and pinned just as often as it is read on a screen.

export interface OurSpeakerListSheetRow {
  memberId: number
  name: string
  note: string
  phones: string[]
  /** Each address with the size it holds on its line at, or on two lines when split after its « @ ». */
  emails: { address: string; size: number; split: boolean }[]
  talks: number[]
}

export interface OurSpeakerListSheet {
  congregationName: string
  /** The day the list is made, already formatted in the congregation's timezone and the reader's locale. */
  date: string
  coordinator: OurListContact | null
  responsible: OurListContact | null
  brothers: OurSpeakerListSheetRow[]
  fontFamily: string
}

// Pure black: these lists come out of office printers.
const INK = '#000000'
const MUTED = '#6b7280'
const RULE = '#cfcac3'
const MARGIN = OUR_LIST_MARGIN
const percent = (share: number) => `${share * 100}%`
const COLUMNS = {
  name: percent(OUR_LIST_COLUMNS.name),
  phone: percent(OUR_LIST_COLUMNS.phone),
  email: percent(OUR_LIST_COLUMNS.email),
  talks: percent(OUR_LIST_COLUMNS.talks),
}

const styles = StyleSheet.create({
  page: {
    paddingTop: MARGIN.top,
    paddingBottom: MARGIN.bottom,
    paddingHorizontal: MARGIN.horizontal,
    color: INK,
    fontSize: OUR_LIST_TEXT_SIZE,
    lineHeight: 1.3,
  },
  masthead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 2.5,
    borderBottomColor: INK,
    paddingBottom: 6,
    marginBottom: 14,
  },
  congregation: { fontSize: 10, color: MUTED },
  title: { fontSize: 20, lineHeight: 1.2, fontWeight: 'bold', marginTop: 1 },
  subtitle: { fontSize: 10, color: MUTED, marginBottom: 3 },
  contacts: { flexDirection: 'row', gap: 24, marginBottom: 18 },
  contact: { flex: 1 },
  label: { fontSize: 8.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  bold: { fontWeight: 'bold' },
  muted: { color: MUTED },
  headerRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 3 },
  row: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: RULE, paddingVertical: 6 },
  cell: { paddingRight: OUR_LIST_CELL_GAP },
  note: { fontSize: 9, color: MUTED, fontStyle: 'italic', marginTop: 1 },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: MARGIN.horizontal,
    right: MARGIN.horizontal,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: MUTED,
  },
})

const keepWords = (word: string) => [word]

/** Words are never hyphenated: a name or an address cut in two is worse than a shorter line. */
function SheetText(props: PropsWithChildren<TextProps>) {
  return <Text hyphenationCallback={keepWords} {...props} />
}

function Contact({ label, contact }: { label: string; contact: OurListContact }) {
  return (
    <View style={styles.contact} wrap={false}>
      <SheetText style={styles.label}>{label}</SheetText>
      <SheetText style={styles.bold}>{sanitizeText(contact.name)}</SheetText>
      {contact.phone !== '' && <SheetText>{sanitizeText(contact.phone)}</SheetText>}
      {contact.email !== '' && <SheetText>{sanitizeText(contact.email)}</SheetText>}
    </View>
  )
}

const Empty = () => <SheetText style={styles.muted}>—</SheetText>

function Phones({ phones }: { phones: string[] }) {
  if (phones.length === 0) return <Empty />
  return phones.map(phone => <SheetText key={phone}>{sanitizeText(phone)}</SheetText>)
}

function Addresses({ emails }: { emails: OurSpeakerListSheetRow['emails'] }) {
  if (emails.length === 0) return <Empty />
  return emails.map(({ address, size, split }) => {
    const lines = split ? addressHalves(address) : [address]
    return (
      <View key={address}>
        {lines.map(line => (
          <SheetText key={line} style={{ fontSize: size }}>
            {sanitizeText(line)}
          </SheetText>
        ))}
      </View>
    )
  })
}

export function OurSpeakerListDocument({ sheet }: { sheet: OurSpeakerListSheet }) {
  const count = sheet.brothers.length
  const subtitle = m.external_speakers_pdf_subtitle({ date: sheet.date, count })
  const congregationName = sanitizeText(sheet.congregationName)
  return (
    <Document title={`${m.external_speakers_pdf_title()} · ${congregationName}`}>
      <Page size="A4" style={[styles.page, { fontFamily: sheet.fontFamily }]}>
        <View style={styles.masthead}>
          <View>
            <SheetText style={styles.congregation}>{congregationName}</SheetText>
            <SheetText style={styles.title}>{m.external_speakers_pdf_title()}</SheetText>
          </View>
          <SheetText style={styles.subtitle}>{subtitle}</SheetText>
        </View>

        {(sheet.coordinator || sheet.responsible) && (
          <View style={styles.contacts}>
            {sheet.coordinator && <Contact label={m.external_speakers_coordinator()} contact={sheet.coordinator} />}
            {sheet.responsible && <Contact label={m.external_speakers_responsible()} contact={sheet.responsible} />}
          </View>
        )}

        <View style={styles.headerRow} fixed>
          <SheetText style={[styles.label, styles.cell, { width: COLUMNS.name }]}>
            {m.external_speakers_pdf_col_brother()}
          </SheetText>
          <SheetText style={[styles.label, styles.cell, { width: COLUMNS.phone }]}>
            {m.external_speakers_pdf_col_phone()}
          </SheetText>
          <SheetText style={[styles.label, styles.cell, { width: COLUMNS.email }]}>
            {m.external_speakers_pdf_col_email()}
          </SheetText>
          <SheetText style={[styles.label, { width: COLUMNS.talks }]}>{m.external_speakers_pdf_col_talks()}</SheetText>
        </View>
        {sheet.brothers.map(row => (
          <View key={row.memberId} style={styles.row} wrap={false}>
            <View style={[styles.cell, { width: COLUMNS.name }]}>
              <SheetText style={styles.bold}>{sanitizeText(row.name)}</SheetText>
              {row.note !== '' && <SheetText style={styles.note}>{sanitizeText(row.note)}</SheetText>}
            </View>
            <View style={[styles.cell, { width: COLUMNS.phone }]}>
              <Phones phones={row.phones} />
            </View>
            <View style={[styles.cell, { width: COLUMNS.email }]}>
              <Addresses emails={row.emails} />
            </View>
            <View style={{ width: COLUMNS.talks }}>
              <SheetText style={row.talks.length === 0 ? styles.muted : undefined}>
                {row.talks.length === 0 ? '—' : row.talks.join(', ')}
              </SheetText>
            </View>
          </View>
        ))}

        <View style={styles.footer} fixed>
          <SheetText>{m.external_speakers_pdf_footer({ name: congregationName, date: sheet.date })}</SheetText>
          <SheetText render={({ pageNumber, totalPages }) => (totalPages > 1 ? `${pageNumber} / ${totalPages}` : '')} />
        </View>
      </Page>
    </Document>
  )
}

/** The document as react-pdf renders it, for the download and the e-mail attachment. */
export function ourSpeakerListDocument(sheet: OurSpeakerListSheet): ReactElement<DocumentProps> {
  return <OurSpeakerListDocument sheet={sheet} />
}
