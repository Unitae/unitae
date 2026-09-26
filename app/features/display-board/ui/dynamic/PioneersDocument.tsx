import path from 'node:path'
import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import {
  type BoardPerson,
  formatBoardPersonName,
  groupPioneersByType,
  pioneerTypeLabel,
} from '~/features/display-board/model/board-roster'
import { sanitizeText } from '~/shared/utils/sanitize-text'

// The printable « Pionniers » — one section per pioneer type, in the board's order, names in two
// columns, each section kept whole on its page.

function ensureFontsRegistered() {
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

const INK = '#1a1a1a'
const MUTED = '#6b7280'
const RULE = '#d6d3d1'

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 42, paddingHorizontal: 44, fontFamily: 'Fira Sans', fontSize: 9, color: INK },
  congregation: { fontSize: 7, textTransform: 'uppercase', letterSpacing: 1, color: MUTED },
  title: { fontSize: 20, fontWeight: 'bold', marginTop: 2, marginBottom: 14 },
  section: { borderWidth: 1, borderColor: RULE, borderRadius: 6, padding: 12, marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', marginBottom: 6 },
  sectionCount: { fontSize: 9, fontWeight: 'normal', color: MUTED },
  names: { flexDirection: 'row', flexWrap: 'wrap' },
  nameCell: { width: '50%', paddingRight: 8 },
  name: { fontSize: 9, lineHeight: 1.45 },
  muted: { color: MUTED },
  anonymized: { color: MUTED, fontStyle: 'italic' },
  bold: { fontWeight: 'bold' },
})

type Pioneer = BoardPerson & { type: string }

function PersonName({ person }: { person: Pioneer }) {
  const name = formatBoardPersonName(person)
  if (name.kind === 'anonymized')
    return <Text style={[styles.name, styles.anonymized]}>{sanitizeText(name.plain)}</Text>
  if (name.kind === 'empty') return <Text style={styles.name}>{name.plain}</Text>
  return (
    <Text style={styles.name}>
      {name.firstname && <Text style={styles.muted}>{sanitizeText(name.firstname)} </Text>}
      {name.lastname && <Text style={styles.bold}>{sanitizeText(name.lastname)}</Text>}
    </Text>
  )
}

export function PioneersDocument({
  pioneers,
  title,
  congregationName,
}: {
  pioneers: Pioneer[]
  title: string
  congregationName: string
}) {
  ensureFontsRegistered()

  return (
    <Document title={sanitizeText(title)}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.congregation}>{sanitizeText(congregationName)}</Text>
        <Text style={styles.title}>{sanitizeText(title)}</Text>
        {groupPioneersByType(pioneers).map(({ type, pioneers: members }) => (
          <View key={type} style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>
              {sanitizeText(pioneerTypeLabel(type))}
              <Text style={styles.sectionCount}> · {members.length}</Text>
            </Text>
            <View style={styles.names}>
              {members.map(pioneer => (
                <View key={pioneer.id} style={styles.nameCell}>
                  <PersonName person={pioneer} />
                </View>
              ))}
            </View>
          </View>
        ))}
      </Page>
    </Document>
  )
}
