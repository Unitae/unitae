import { StyleSheet, Text, View } from '@react-pdf/renderer'
import type { OrganigramHolder, OrganigramNode } from '~/shared/domain/organigram.queries'
import { type RosterBlock, seatLabel, serviceParts } from '~/shared/domain/organigram-layout'
import { sanitizeText } from '~/shared/utils/sanitize-text'
import {
  BOARD_PDF_INK,
  BOARD_PDF_MUTED,
  BOARD_PDF_RULE,
  BoardPdfLabel,
  BoardPdfPersonName,
  boardPdfStyles,
  SheetText,
  useAccentColor,
} from './board-pdf'

// The pieces the printable organigram is built from: the rosters, a committee post, and a service
// with its people — on a line across the page, or stacked in a chart column.

export const ORGANIGRAM_SIZE = 10.5

export function makeOrganigramStyles(s: number) {
  return StyleSheet.create({
    text: { fontSize: s, lineHeight: 1.3 },
    muted: { fontSize: s, lineHeight: 1.3, color: BOARD_PDF_MUTED },
    rosters: { flexDirection: 'row', gap: 22, marginBottom: 14 },
    roster: { flex: 1 },
    heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
    headingText: { fontSize: 1.25 * s, fontWeight: 'bold' },
    count: { fontSize: s, color: BOARD_PDF_MUTED },
    names: { flexDirection: 'row', gap: 10 },
    nameColumn: { flex: 1 },

    committee: { marginBottom: 14 },
    posts: { flexDirection: 'row', gap: 22, marginTop: 2 },
    post: { flex: 1 },
    postName: { fontSize: 1.15 * s, lineHeight: 1.3 },

    section: { marginBottom: 14 },
    sectionName: { fontSize: 1.45 * s, fontWeight: 'bold', marginBottom: 4 },

    line: { flexDirection: 'row', gap: 14, paddingVertical: 4, borderTopWidth: 0.5, borderTopColor: BOARD_PDF_RULE },
    lineName: { width: 160, fontSize: s, lineHeight: 1.3 },
    lineBody: { flex: 1 },
    teams: { fontSize: 0.95 * s, lineHeight: 1.3, color: BOARD_PDF_MUTED, marginTop: 1 },
    note: { fontSize: 0.95 * s, color: BOARD_PDF_MUTED, fontStyle: 'italic', marginTop: 1 },

    // Chart: a column per committee post; a service's name over its people.
    chart: { flexDirection: 'row', gap: 18, marginBottom: 14 },
    chartColumn: { flex: 1 },
    chartHead: { paddingBottom: 6, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: BOARD_PDF_INK },
    chartService: { paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: BOARD_PDF_RULE },
    chartServiceName: { fontSize: s, lineHeight: 1.3, fontWeight: 'bold' },
  })
}

export type OrganigramStyles = ReturnType<typeof makeOrganigramStyles>

/** « Prénom NOM » inside a running line: muted first name, bold uppercase last name. */
function NameRuns({ person }: { person: OrganigramHolder }) {
  return (
    <Text>
      {person.firstname && <Text style={boardPdfStyles.muted}>{sanitizeText(person.firstname)} </Text>}
      {person.lastname && <Text style={boardPdfStyles.bold}>{sanitizeText(person.lastname.toLocaleUpperCase())}</Text>}
    </Text>
  )
}

/**
 * « Responsable Nathalie GARCIA   Adjoint Alain MOREL » — titled seats, each name kept whole.
 * Stacked, each seat takes its own line, for narrow columns.
 */
function Seats({
  holders,
  node,
  styles,
  stacked = false,
}: {
  holders: OrganigramHolder[]
  node: OrganigramNode
  styles: OrganigramStyles
  stacked?: boolean
}) {
  const accentColor = useAccentColor()
  if (holders.length === 0) return null
  const seat = (holder: OrganigramHolder) => {
    const label = seatLabel(holder, node)
    return (
      <>
        {label && <Text style={{ color: accentColor }}>{label} </Text>}
        <NameRuns person={holder} />
      </>
    )
  }
  if (stacked) {
    return (
      <>
        {holders.map(holder => (
          <SheetText key={`${holder.memberId}-${holder.kind}`} style={styles.text}>
            {seat(holder)}
          </SheetText>
        ))}
      </>
    )
  }
  return (
    <SheetText style={styles.text}>
      {holders.map((holder, index) => (
        <Text key={`${holder.memberId}-${holder.kind}`}>
          {index > 0 && '     '}
          {seat(holder)}
        </Text>
      ))}
    </SheetText>
  )
}

function Teams({ teams, styles }: { teams: OrganigramNode[]; styles: OrganigramStyles }) {
  if (teams.length === 0) return null
  return (
    <SheetText style={styles.teams}>
      {teams.length === 1 ? 'Équipe ' : 'Équipes '}
      {teams.map(team => sanitizeText(team.name)).join(', ')}
    </SheetText>
  )
}

/** A service across the page: its name on the left, its people on the right. Never split. */
export function Line({
  node,
  rows,
  styles,
}: {
  node: OrganigramNode
  rows: OrganigramNode[] | null
  styles: OrganigramStyles
}) {
  const { holders, teams } = serviceParts(node, rows)
  return (
    <View style={styles.line} wrap={false}>
      <SheetText style={styles.lineName}>{sanitizeText(node.name)}</SheetText>
      <View style={styles.lineBody}>
        <Seats holders={holders} node={node} styles={styles} />
        <Teams teams={teams} styles={styles} />
        {node.note && <SheetText style={styles.note}>{sanitizeText(node.note)}</SheetText>}
      </View>
    </View>
  )
}

/** A service in a chart column: its name, then each of its people on a line. Never split. */
export function ChartService({
  node,
  rows,
  styles,
}: {
  node: OrganigramNode
  rows: OrganigramNode[] | null
  styles: OrganigramStyles
}) {
  const { holders, teams } = serviceParts(node, rows)
  return (
    <View style={styles.chartService} wrap={false}>
      <SheetText style={styles.chartServiceName}>{sanitizeText(node.name)}</SheetText>
      <Seats holders={holders} node={node} styles={styles} stacked />
      <Teams teams={teams} styles={styles} />
      {node.note && <SheetText style={styles.note}>{sanitizeText(node.note)}</SheetText>}
    </View>
  )
}

/** A roster — the elders, the ministerial servants — its names down two columns. */
export function Roster({ block, styles }: { block: RosterBlock; styles: OrganigramStyles }) {
  const holders = block.node.holders
  const half = Math.ceil(holders.length / 2)
  return (
    <View style={styles.roster}>
      <View style={styles.heading} wrap={false} minPresenceAhead={30}>
        <SheetText style={styles.headingText}>{sanitizeText(block.title)}</SheetText>
        <SheetText style={styles.count}>{holders.length}</SheetText>
      </View>
      <View style={styles.names}>
        {[holders.slice(0, half), holders.slice(half)].map((column, index) => (
          <View key={index} style={styles.nameColumn}>
            {column.map(holder => (
              <BoardPdfPersonName key={holder.memberId} person={holder} style={styles.text} />
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

/** A committee post: its name in the accent, who holds it, and any adjoint. */
export function Post({ post, styles }: { post: OrganigramNode; styles: OrganigramStyles }) {
  const titular = post.holders.find(holder => holder.kind === 'leader')
  const deputies = post.holders.filter(holder => holder.kind === 'deputy')
  return (
    <>
      <BoardPdfLabel style={styles.text}>{sanitizeText(post.name)}</BoardPdfLabel>
      {titular ? (
        <BoardPdfPersonName person={titular} style={styles.postName} />
      ) : (
        <SheetText style={[styles.postName, { color: BOARD_PDF_MUTED }]}>—</SheetText>
      )}
      {deputies.map(deputy => (
        <SheetText key={deputy.memberId} style={styles.text}>
          <BoardPdfLabel>Adjoint </BoardPdfLabel>
          <NameRuns person={deputy} />
        </SheetText>
      ))}
    </>
  )
}
