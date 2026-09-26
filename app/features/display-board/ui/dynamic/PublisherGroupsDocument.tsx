import path from 'node:path'
import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { type BoardPerson, buildGroupRoster, formatBoardPersonName } from '~/features/display-board/model/board-roster'
import * as m from '~/i18n/paraglide/messages'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { sanitizeText } from '~/shared/utils/sanitize-text'

// The printable « Groupes de prédication » — the same cards the board shows, two per row, each
// kept whole on its page.

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
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: { width: '48.5%', borderWidth: 1, borderColor: RULE, borderRadius: 6, padding: 12, marginBottom: 12 },
  address: { fontSize: 6.5, textTransform: 'uppercase', letterSpacing: 0.8, color: MUTED },
  groupName: { fontSize: 13, fontWeight: 'bold', marginTop: 2, marginBottom: 8 },
  leaders: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  leader: { flex: 1 },
  eyebrow: { fontSize: 6, textTransform: 'uppercase', letterSpacing: 1, color: MUTED, marginBottom: 1 },
  rule: { borderBottomWidth: 0.75, borderBottomColor: RULE, borderStyle: 'dashed', marginBottom: 6 },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  count: { fontSize: 9, fontWeight: 'bold' },
  name: { fontSize: 9, lineHeight: 1.45 },
  muted: { color: MUTED },
  anonymized: { color: MUTED, fontStyle: 'italic' },
  bold: { fontWeight: 'bold' },
})

type Person = BoardPerson

interface PublisherGroup {
  id: number
  name: string
  adress: string
  responsible: Person
  deputy: Person | null
  members: Person[]
}

function PersonName({ person }: { person: Person }) {
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

function GroupCard({ group }: { group: PublisherGroup }) {
  const roster = buildGroupRoster(group)
  return (
    <View style={styles.card} wrap={false}>
      <Text style={styles.address}>{sanitizeText(group.adress)}</Text>
      <Text style={styles.groupName}>{sanitizeText(formatGroupName(group.name))}</Text>

      <View style={styles.leaders}>
        <View style={styles.leader}>
          <Text style={styles.eyebrow}>{m.board_dynamic_publisher_groups_responsible_label()}</Text>
          <PersonName person={group.responsible} />
        </View>
        {group.deputy && (
          <View style={styles.leader}>
            <Text style={styles.eyebrow}>{m.board_dynamic_publisher_groups_deputy_label()}</Text>
            <PersonName person={group.deputy} />
          </View>
        )}
      </View>

      <View style={styles.rule} />
      <View style={styles.countRow}>
        <Text style={styles.eyebrow}>{m.board_dynamic_publisher_groups_members_label()}</Text>
        <Text style={styles.count}>{roster.length}</Text>
      </View>
      {roster.map(person => (
        <PersonName key={person.id} person={person} />
      ))}
    </View>
  )
}

export function PublisherGroupsDocument({
  groups,
  title,
  congregationName,
}: {
  groups: PublisherGroup[]
  title: string
  congregationName: string
}) {
  ensureFontsRegistered()

  return (
    <Document title={sanitizeText(title)}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.congregation}>{sanitizeText(congregationName)}</Text>
        <Text style={styles.title}>{sanitizeText(title)}</Text>
        <View style={styles.grid}>
          {groups.map(group => (
            <GroupCard key={group.id} group={group} />
          ))}
        </View>
      </Page>
    </Document>
  )
}
