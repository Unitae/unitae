import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { type BoardPerson, buildGroupRoster } from '~/features/display-board/model/board-roster'
import {
  BOARD_PDF_MUTED,
  BOARD_PDF_RULE,
  BoardPdfPersonName,
  boardPdfStyles,
  ensureBoardPdfFontsRegistered,
} from '~/features/display-board/ui/dynamic/board-pdf'
import * as m from '~/i18n/paraglide/messages'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { sanitizeText } from '~/shared/utils/sanitize-text'

// The printable « Groupes de prédication » — the same cards the board shows, two per row. A card's
// heading stays whole; its roster may continue on the next page, since a large group can be
// taller than a page and an unbreakable block would silently lose the names that do not fit.

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: { width: '48.5%', borderWidth: 1, borderColor: BOARD_PDF_RULE, borderRadius: 6, padding: 12, marginBottom: 12 },
  address: { fontSize: 6.5, textTransform: 'uppercase', letterSpacing: 0.8, color: BOARD_PDF_MUTED },
  groupName: { fontSize: 13, fontWeight: 'bold', marginTop: 2, marginBottom: 8 },
  leaders: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  leader: { flex: 1 },
  eyebrow: { fontSize: 6, textTransform: 'uppercase', letterSpacing: 1, color: BOARD_PDF_MUTED, marginBottom: 1 },
  rule: { borderBottomWidth: 0.75, borderBottomColor: BOARD_PDF_RULE, borderStyle: 'dashed', marginBottom: 6 },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  count: { fontSize: 9, fontWeight: 'bold' },
})

interface PublisherGroup {
  id: number
  name: string
  adress: string
  responsible: BoardPerson
  deputy: BoardPerson | null
  members: BoardPerson[]
}

function GroupCard({ group }: { group: PublisherGroup }) {
  const roster = buildGroupRoster(group)
  return (
    <View style={styles.card}>
      <View wrap={false} minPresenceAhead={40}>
        <Text style={styles.address}>{sanitizeText(group.adress)}</Text>
        <Text style={styles.groupName}>{sanitizeText(formatGroupName(group.name))}</Text>

        <View style={styles.leaders}>
          <View style={styles.leader}>
            <Text style={styles.eyebrow}>{m.board_dynamic_publisher_groups_responsible_label()}</Text>
            <BoardPdfPersonName person={group.responsible} />
          </View>
          {group.deputy && (
            <View style={styles.leader}>
              <Text style={styles.eyebrow}>{m.board_dynamic_publisher_groups_deputy_label()}</Text>
              <BoardPdfPersonName person={group.deputy} />
            </View>
          )}
        </View>

        <View style={styles.rule} />
        <View style={styles.countRow}>
          <Text style={styles.eyebrow}>{m.board_dynamic_publisher_groups_members_label()}</Text>
          <Text style={styles.count}>{roster.length}</Text>
        </View>
      </View>
      {roster.map(person => (
        <BoardPdfPersonName key={person.id} person={person} />
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
  ensureBoardPdfFontsRegistered()

  return (
    <Document title={sanitizeText(title)}>
      <Page size="A4" style={boardPdfStyles.page}>
        <Text style={boardPdfStyles.congregation}>{sanitizeText(congregationName)}</Text>
        <Text style={boardPdfStyles.title}>{sanitizeText(title)}</Text>
        <View style={styles.grid}>
          {groups.map(group => (
            <GroupCard key={group.id} group={group} />
          ))}
        </View>
      </Page>
    </Document>
  )
}
