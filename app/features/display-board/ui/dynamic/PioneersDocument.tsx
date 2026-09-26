import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { type BoardPerson, groupPioneersByType, pioneerTypeLabel } from '~/features/display-board/model/board-roster'
import {
  BOARD_PDF_MUTED,
  BOARD_PDF_RULE,
  BoardPdfPersonName,
  boardPdfStyles,
  ensureBoardPdfFontsRegistered,
} from '~/features/display-board/ui/dynamic/board-pdf'
import { sanitizeText } from '~/shared/utils/sanitize-text'

// The printable « Pionniers » — one section per pioneer type, in the board's order, names in two
// columns. A section's heading stays with its first names; the names may continue on the next
// page rather than be cut off.

const styles = StyleSheet.create({
  section: { borderWidth: 1, borderColor: BOARD_PDF_RULE, borderRadius: 6, padding: 12, marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', marginBottom: 6 },
  sectionCount: { fontSize: 9, fontWeight: 'normal', color: BOARD_PDF_MUTED },
  names: { flexDirection: 'row', flexWrap: 'wrap' },
  nameCell: { width: '50%', paddingRight: 8 },
})

type Pioneer = BoardPerson & { type: string }

export function PioneersDocument({
  pioneers,
  title,
  congregationName,
}: {
  pioneers: Pioneer[]
  title: string
  congregationName: string
}) {
  ensureBoardPdfFontsRegistered()

  return (
    <Document title={sanitizeText(title)}>
      <Page size="A4" style={boardPdfStyles.page}>
        <Text style={boardPdfStyles.congregation}>{sanitizeText(congregationName)}</Text>
        <Text style={boardPdfStyles.title}>{sanitizeText(title)}</Text>
        {groupPioneersByType(pioneers).map(({ type, pioneers: members }) => (
          <View key={type} style={styles.section}>
            <Text style={styles.sectionTitle} minPresenceAhead={40}>
              {sanitizeText(pioneerTypeLabel(type))}
              <Text style={styles.sectionCount}> · {members.length}</Text>
            </Text>
            <View style={styles.names}>
              {members.map(pioneer => (
                <View key={pioneer.id} style={styles.nameCell} wrap={false}>
                  <BoardPdfPersonName person={pioneer} />
                </View>
              ))}
            </View>
          </View>
        ))}
      </Page>
    </Document>
  )
}
