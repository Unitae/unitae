import { Page, StyleSheet, Text, type TextProps, View } from '@react-pdf/renderer'
import { createContext, type PropsWithChildren, type ReactNode, useContext } from 'react'
import { BOARD_TYPEFACE_FAMILY, type BoardTypeface } from '~/features/display-board/model/board-appearance'
import { type BoardPerson, formatBoardPersonName } from '~/features/display-board/model/board-roster'
import { ENTRY_RULE, MASTHEAD, SHEET_MARGIN, type SheetOrientation } from '~/features/display-board/model/sheet-page'
import * as m from '~/i18n/paraglide/messages'
import { sanitizeText } from '~/shared/utils/sanitize-text'

// What every printable board sheet shares, so they read as one set: the page, the palette, the
// masthead, the page number and the « Prénom NOM » name. Pinned sheets are read standing, a metre
// away: structure comes from type and rules, not boxes. The appearance only changes the typeface
// and the accent; the margins, the masthead, the black text and the rules are the same for all.

/** One style object, as react-pdf's `style` prop takes alone or in a list. */
export type PdfStyle = Exclude<NonNullable<TextProps['style']>, readonly unknown[]>

// Pure black: these sheets come out of office laser printers.
export const BOARD_PDF_INK = '#000000'
export const BOARD_PDF_MUTED = '#6b7280'
export const BOARD_PDF_FAINT = '#c4c9d0'
export const BOARD_PDF_RULE = '#cfcac3'
const FALLBACK_FAMILY = BOARD_TYPEFACE_FAMILY.fira

const AccentContext = createContext(BOARD_PDF_INK)

export const boardPdfStyles = StyleSheet.create({
  page: {
    paddingTop: SHEET_MARGIN.top,
    paddingBottom: SHEET_MARGIN.bottom,
    paddingHorizontal: SHEET_MARGIN.horizontal,
    color: BOARD_PDF_INK,
    fontSize: 10,
  },
  masthead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: MASTHEAD.rule,
    borderBottomColor: BOARD_PDF_INK,
    paddingBottom: MASTHEAD.padding,
    marginBottom: MASTHEAD.gap,
  },
  congregation: { fontSize: MASTHEAD.congregationSize, lineHeight: MASTHEAD.lineHeight, color: BOARD_PDF_MUTED },
  title: { fontSize: MASTHEAD.titleSize, lineHeight: MASTHEAD.lineHeight, fontWeight: 'bold', marginTop: 1 },
  asOf: { fontSize: MASTHEAD.congregationSize, color: BOARD_PDF_MUTED, marginBottom: 3 },
  pageNumber: { position: 'absolute', bottom: 12, right: SHEET_MARGIN.horizontal, fontSize: 8, color: BOARD_PDF_MUTED },
  // Each entry after the first in a column opens on a black rule.
  entryRule: { borderTopWidth: ENTRY_RULE.width, borderTopColor: BOARD_PDF_INK, paddingTop: ENTRY_RULE.padding },
  muted: { color: BOARD_PDF_MUTED },
  anonymized: { color: BOARD_PDF_MUTED, fontStyle: 'italic' },
  bold: { fontWeight: 'bold' },
})

const keepWords = (word: string) => [word]

/**
 * Text on a board sheet. Words are never hyphenated: a name cut in two (« LEVAL-LOIS ») is worse
 * than a shorter line, and the sheets plan their lines assuming whole words.
 */
export function SheetText(props: PropsWithChildren<TextProps>) {
  return <Text hyphenationCallback={keepWords} {...props} />
}

/** An A4 page in the document's typeface, falling back to Fira Sans for a character it lacks. */
export function BoardPdfPage({
  typeface,
  accentColor,
  orientation = 'portrait',
  children,
}: {
  typeface: BoardTypeface
  accentColor: string
  orientation?: SheetOrientation
  children: ReactNode
}) {
  const family = BOARD_TYPEFACE_FAMILY[typeface]
  return (
    <AccentContext.Provider value={accentColor}>
      <Page
        size="A4"
        orientation={orientation}
        style={[boardPdfStyles.page, { fontFamily: family === FALLBACK_FAMILY ? family : [family, FALLBACK_FAMILY] }]}
      >
        {children}
        <SheetText
          style={boardPdfStyles.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) => (totalPages > 1 ? `${pageNumber} / ${totalPages}` : '')}
        />
      </Page>
    </AccentContext.Provider>
  )
}

/** Congregation, sheet title and how fresh it is, over a heavy rule. Printed once, on the first page. */
export function BoardPdfMasthead({
  congregationName,
  title,
  asOf,
}: {
  congregationName: string
  title: string
  /** The print date, already formatted in the congregation's timezone. */
  asOf: string
}) {
  return (
    <View style={boardPdfStyles.masthead}>
      <View>
        <SheetText style={boardPdfStyles.congregation}>{sanitizeText(congregationName)}</SheetText>
        <SheetText style={boardPdfStyles.title}>{sanitizeText(title)}</SheetText>
      </View>
      <SheetText style={boardPdfStyles.asOf}>{m.board_pdf_as_of({ date: asOf })}</SheetText>
    </View>
  )
}

export function useAccentColor(): string {
  return useContext(AccentContext)
}

/** A label in the document's accent: « Responsable », « Adjoint », a post's name. */
export function BoardPdfLabel({ children, style }: { children: ReactNode; style?: PdfStyle }) {
  const accentColor = useAccentColor()
  return <SheetText style={[{ color: accentColor }, ...(style ? [style] : [])]}>{children}</SheetText>
}

/** « Prénom NOM » as the board lists print it: muted first name, bold uppercase last name. */
export function BoardPdfPersonName({ person, style }: { person: Omit<BoardPerson, 'id'>; style?: PdfStyle }) {
  const name = formatBoardPersonName(person)
  const base = style ? [style] : []
  if (name.kind === 'anonymized') {
    return <SheetText style={[...base, boardPdfStyles.anonymized]}>{sanitizeText(name.plain)}</SheetText>
  }
  if (name.kind === 'empty') return <SheetText style={base}>{name.plain}</SheetText>
  return (
    <SheetText style={base}>
      {name.firstname && <Text style={boardPdfStyles.muted}>{sanitizeText(name.firstname)} </Text>}
      {name.lastname && <Text style={boardPdfStyles.bold}>{sanitizeText(name.lastname)}</Text>}
    </SheetText>
  )
}
