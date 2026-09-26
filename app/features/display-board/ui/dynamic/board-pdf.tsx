import path from 'node:path'
import { Font, StyleSheet, Text } from '@react-pdf/renderer'
import { type BoardPerson, formatBoardPersonName } from '~/features/display-board/model/board-roster'
import { sanitizeText } from '~/shared/utils/sanitize-text'

// What the board's list sheets (publisher groups, pioneers) share: fonts, palette, and the
// react-pdf counterpart of BoardPersonName, so the two sheets cannot drift apart.

export function ensureBoardPdfFontsRegistered() {
  const fontsDir = path.join(process.cwd(), 'public', 'fonts')
  Font.register({
    family: 'Fira Sans',
    fonts: [
      { src: path.join(fontsDir, 'FiraSans-Regular.ttf') },
      { src: path.join(fontsDir, 'FiraSans-Bold.ttf'), fontWeight: 'bold' },
      { src: path.join(fontsDir, 'FiraSans-Italic.ttf'), fontStyle: 'italic' },
    ],
  })
}

export const BOARD_PDF_INK = '#1a1a1a'
export const BOARD_PDF_MUTED = '#6b7280'
export const BOARD_PDF_RULE = '#d6d3d1'

export const boardPdfStyles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 42,
    paddingHorizontal: 44,
    fontFamily: 'Fira Sans',
    fontSize: 9,
    color: BOARD_PDF_INK,
  },
  congregation: { fontSize: 7, textTransform: 'uppercase', letterSpacing: 1, color: BOARD_PDF_MUTED },
  title: { fontSize: 20, fontWeight: 'bold', marginTop: 2, marginBottom: 14 },
  name: { fontSize: 9, lineHeight: 1.45 },
  muted: { color: BOARD_PDF_MUTED },
  anonymized: { color: BOARD_PDF_MUTED, fontStyle: 'italic' },
  bold: { fontWeight: 'bold' },
})

/** « Prénom NOM » as the board lists print it: muted first name, bold uppercase last name. */
export function BoardPdfPersonName({ person }: { person: Omit<BoardPerson, 'id'> }) {
  const name = formatBoardPersonName(person)
  if (name.kind === 'anonymized') {
    return <Text style={[boardPdfStyles.name, boardPdfStyles.anonymized]}>{sanitizeText(name.plain)}</Text>
  }
  if (name.kind === 'empty') return <Text style={boardPdfStyles.name}>{name.plain}</Text>
  return (
    <Text style={boardPdfStyles.name}>
      {name.firstname && <Text style={boardPdfStyles.muted}>{sanitizeText(name.firstname)} </Text>}
      {name.lastname && <Text style={boardPdfStyles.bold}>{sanitizeText(name.lastname)}</Text>}
    </Text>
  )
}
