import path from 'node:path'
import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { OrganigramHolder, OrganigramNode } from '~/shared/domain/organigram.queries'
import type { BandBlock, CommitteeBlock, RosterBlock } from '~/shared/domain/organigram-layout'
import { groupLayout, responsibilityEyebrow, seatLabel, toLayout } from '~/shared/domain/organigram-layout'
import { sanitizeText } from '~/shared/utils/sanitize-text'

// The printable « Organisation des services » — the same sheet the board shows, as the A4 page
// it gets pinned up as. Same reading order, same vocabulary, same blocks: rosters as the
// masthead, the committee bench as the one framed element, each branch under its
// « Sous la responsabilité du … » header.

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

const TEAL = '#0f766e'
const INK = '#1a1a1a'
const MUTED = '#6b7280'
const RULE = '#d6d3d1'

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 42, paddingHorizontal: 44, fontFamily: 'Fira Sans', fontSize: 9, color: INK },
  congregation: { fontSize: 7, textTransform: 'uppercase', letterSpacing: 1, color: MUTED },
  title: { fontSize: 20, fontWeight: 'bold', marginTop: 2, marginBottom: 14 },

  rosterRow: { flexDirection: 'row', gap: 24, marginBottom: 14 },
  roster: { flex: 1, borderTopWidth: 1.5, borderTopColor: INK, paddingTop: 4 },
  rosterTitle: { fontSize: 7, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  rosterNames: { fontSize: 8.5, lineHeight: 1.5 },

  bench: { borderWidth: 1, borderColor: RULE, borderTopWidth: 2, borderTopColor: TEAL, marginBottom: 16 },
  benchTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
    backgroundColor: '#f7f6f4',
  },
  benchRow: { flexDirection: 'row' },
  benchCell: { flex: 1, paddingHorizontal: 10, paddingVertical: 7 },
  benchCellDivider: { borderLeftWidth: 1, borderLeftColor: RULE },
  benchEyebrow: { fontSize: 6, textTransform: 'uppercase', letterSpacing: 0.8, color: MUTED, minHeight: 14 },
  benchName: { fontSize: 10.5, marginTop: 1 },
  benchDeputy: { fontSize: 7.5, color: MUTED, marginTop: 2 },

  section: { marginBottom: 13 },
  sectionEyebrow: { fontSize: 6.5, textTransform: 'uppercase', letterSpacing: 1, color: MUTED },
  sectionName: { fontSize: 12.5, fontWeight: 'bold', marginTop: 1, marginBottom: 3 },
  sectionRule: { borderBottomWidth: 0.75, borderBottomColor: RULE, marginBottom: 4 },

  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingVertical: 2.5 },
  lineName: { width: 140, fontSize: 9 },
  lineBody: { flex: 1, fontSize: 9 },
  seatTitle: { fontSize: 6.5, textTransform: 'uppercase', letterSpacing: 0.8, color: TEAL },
  people: { fontSize: 9, color: '#333333' },
  teamsLine: { fontSize: 8, color: MUTED, marginTop: 1.5 },
  teamsLabel: { fontSize: 6.5, textTransform: 'uppercase', letterSpacing: 0.8, color: MUTED },
  note: { fontSize: 7.5, color: MUTED, fontStyle: 'italic', marginTop: 1 },
})

function formatName(person: OrganigramHolder): string {
  const lastname = person.lastname?.toLocaleUpperCase() ?? null
  return sanitizeText([person.firstname, lastname].filter(Boolean).join(' ') || '—')
}

/** « RESPONSABLE Philippe MARTIN · ADJOINTS … » as inline styled runs. */
function PeopleLine({ node, membersHidden }: { node: OrganigramNode; membersHidden: boolean }) {
  const holders = membersHidden
    ? node.holders.filter(holder => holder.kind === 'leader' || holder.kind === 'deputy')
    : node.holders
  if (holders.length === 0) return null
  return (
    <Text style={styles.people}>
      {holders.map((holder, index) => {
        const label = seatLabel(holder, node)
        return (
          <Text key={`${holder.memberId}-${holder.kind}`}>
            {index > 0 && <Text style={{ color: '#b9b5b0' }}>{'  ·  '}</Text>}
            {label && <Text style={styles.seatTitle}>{label.toUpperCase()} </Text>}
            {formatName(holder)}
          </Text>
        )
      })}
    </Text>
  )
}

function Line({ node }: { node: OrganigramNode }) {
  return (
    <View style={styles.line} wrap={false}>
      <Text style={styles.lineName}>{sanitizeText(node.name)}</Text>
      <View style={styles.lineBody}>
        <PeopleLine node={node} membersHidden />
        {node.note && <Text style={styles.note}>{sanitizeText(node.note)}</Text>}
      </View>
    </View>
  )
}

function ServiceWithTeams({ node, teams }: { node: OrganigramNode; teams: OrganigramNode[] }) {
  const leaders = node.holders.filter(holder => holder.kind === 'leader')
  const seen = new Set(leaders.map(leader => leader.memberId))
  const deputies = [
    ...node.holders.filter(holder => holder.kind === 'deputy'),
    ...teams.flatMap(team => team.holders.filter(holder => holder.kind === 'leader')),
  ].filter(deputy => !seen.has(deputy.memberId) && seen.add(deputy.memberId))

  return (
    <View style={styles.line} wrap={false}>
      <Text style={styles.lineName}>{sanitizeText(node.name)}</Text>
      <View style={styles.lineBody}>
        <Text style={styles.people}>
          {leaders.map((leader, index) => {
            const label = seatLabel(leader, node)
            return (
              <Text key={leader.memberId}>
                {index > 0 && '  ·  '}
                {label && <Text style={styles.seatTitle}>{label.toUpperCase()} </Text>}
                {formatName(leader)}
              </Text>
            )
          })}
          {deputies.length > 0 && (
            <Text>
              {leaders.length > 0 && '   '}
              <Text style={styles.seatTitle}>{deputies.length === 1 ? 'ADJOINT ' : 'ADJOINTS '}</Text>
              {deputies.map(deputy => formatName(deputy)).join(', ')}
            </Text>
          )}
        </Text>
        {teams.length > 0 && (
          <Text style={styles.teamsLine}>
            <Text style={styles.teamsLabel}>{teams.length === 1 ? 'ÉQUIPE ' : 'ÉQUIPES '}</Text>
            {teams.map(team => sanitizeText(team.name)).join(', ')}
          </Text>
        )}
        {node.note && <Text style={styles.note}>{sanitizeText(node.note)}</Text>}
      </View>
    </View>
  )
}

function Roster({ block }: { block: RosterBlock }) {
  return (
    <View style={styles.roster}>
      <Text style={styles.rosterTitle}>
        {sanitizeText(block.title)}
        <Text style={{ color: MUTED, fontWeight: 'normal' }}> ({block.node.holders.length})</Text>
      </Text>
      <Text style={styles.rosterNames}>{block.node.holders.map(holder => formatName(holder)).join('  ·  ')}</Text>
    </View>
  )
}

function Bench({ block }: { block: CommitteeBlock }) {
  return (
    <View style={styles.bench} wrap={false}>
      <Text style={styles.benchTitle}>{sanitizeText(block.node.name)}</Text>
      <View style={styles.benchRow}>
        {block.posts.map((post, index) => {
          const titular = post.holders.find(holder => holder.kind === 'leader')
          const deputies = post.holders.filter(holder => holder.kind === 'deputy')
          return (
            <View key={post.id} style={[styles.benchCell, ...(index > 0 ? [styles.benchCellDivider] : [])]}>
              <Text style={styles.benchEyebrow}>{sanitizeText(post.name)}</Text>
              <Text style={[styles.benchName, ...(titular ? [] : [{ color: MUTED }])]}>
                {titular ? formatName(titular) : '—'}
              </Text>
              {deputies.length > 0 && (
                <Text style={styles.benchDeputy}>
                  <Text style={styles.seatTitle}>ADJOINT </Text>
                  {deputies.map(deputy => formatName(deputy)).join(' · ')}
                </Text>
              )}
            </View>
          )
        })}
      </View>
    </View>
  )
}

function Bands({ bands }: { bands: BandBlock[] }) {
  return (
    <>
      {bands.map(band =>
        band.node ? (
          <ServiceWithTeams key={band.id} node={band.node} teams={band.rows} />
        ) : (
          band.rows.map(row => <Line key={row.id} node={row} />)
        ),
      )}
    </>
  )
}

export function OrganigramDocument({
  tree,
  title,
  congregationName,
}: {
  tree: OrganigramNode[]
  title: string
  congregationName: string
}) {
  ensureFontsRegistered()
  const { rosters, committee, sections, legacy } = groupLayout(toLayout(tree))

  return (
    <Document title={sanitizeText(title)}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.congregation}>{sanitizeText(congregationName)}</Text>
        <Text style={styles.title}>{sanitizeText(title)}</Text>

        {rosters.length > 0 && (
          <View style={styles.rosterRow}>
            {rosters.map(roster => (
              <Roster key={roster.id} block={roster} />
            ))}
          </View>
        )}

        {committee && <Bench block={committee} />}

        {sections.map(section => (
          <View key={section.under + String(section.bands[0]?.id ?? '')} style={styles.section} wrap={false}>
            <Text style={styles.sectionEyebrow}>{responsibilityEyebrow(section.under).toUpperCase()}</Text>
            <Text style={styles.sectionName}>{sanitizeText(section.under)}</Text>
            <View style={styles.sectionRule} />
            <Bands bands={section.bands} />
          </View>
        ))}

        {legacy.length > 0 && (
          <View style={styles.section}>
            {legacy.map(block => {
              if (block.kind === 'row') return <Line key={block.id} node={block.node} />
              if (block.kind !== 'band') return null
              if (block.node) return <ServiceWithTeams key={block.id} node={block.node} teams={block.rows} />
              return <Bands key={block.id} bands={[block]} />
            })}
          </View>
        )}
      </Page>
    </Document>
  )
}
