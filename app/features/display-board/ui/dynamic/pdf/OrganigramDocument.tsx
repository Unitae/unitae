import { Document, View } from '@react-pdf/renderer'
import type { BoardLayout, BoardTypeface } from '~/features/display-board/model/board-appearance'
import type { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import type { OrganigramNode } from '~/shared/domain/organigram.queries'
import {
  type BandBlock,
  bandEntries,
  type CommitteeBlock,
  groupLayout,
  responsibilityEyebrow,
  toLayout,
} from '~/shared/domain/organigram-layout'
import { sanitizeText } from '~/shared/utils/sanitize-text'
import { BoardPdfMasthead, BoardPdfPage, boardPdfStyles, SheetText } from './board-pdf'
import {
  ChartService,
  Line,
  makeOrganigramStyles,
  ORGANIGRAM_SIZE,
  type OrganigramStyles,
  Post,
  Roster,
} from './OrganigramSheetParts'

// The printable « Organisation des services », in one of two layouts. Both open on the two
// rosters and keep the board's vocabulary and reading order.
//   leader  the service committee, then each post's services under its « Sous la responsabilité
//           du … » heading, one service per line across the page;
//   chart   the three committee posts side by side, like an organisation chart, each with its
//           services listed beneath it; the services the elders keep follow across the page.
// A service never splits across pages, and a heading never sits alone at the foot of one; a long
// section continues on the next page rather than lose the services that don't fit.

export type OrganigramLayout = BoardLayout<typeof DynamicType.Organigram>

function Committee({ block, styles }: { block: CommitteeBlock; styles: OrganigramStyles }) {
  return (
    <View style={[styles.committee, boardPdfStyles.entryRule]} wrap={false}>
      <SheetText style={[styles.headingText, { marginBottom: 4 }]}>{sanitizeText(block.node.name)}</SheetText>
      <View style={styles.posts}>
        {block.posts.map(post => (
          <View key={post.id} style={styles.post}>
            <Post post={post} styles={styles} />
          </View>
        ))}
      </View>
    </View>
  )
}

function Section({ under, bands, styles }: { under: string; bands: BandBlock[]; styles: OrganigramStyles }) {
  return (
    <View style={[styles.section, boardPdfStyles.entryRule]}>
      <View wrap={false} minPresenceAhead={40}>
        <SheetText style={styles.muted}>{responsibilityEyebrow(under)}</SheetText>
        <SheetText style={styles.sectionName}>{sanitizeText(under)}</SheetText>
      </View>
      {bandEntries(bands).map(({ node, rows }) => (
        <Line key={node.id} node={node} rows={rows} styles={styles} />
      ))}
    </View>
  )
}

/** The committee as an organisation chart: each post heads the column of the services it answers for. */
function Chart({
  committee,
  sections,
  styles,
}: {
  committee: CommitteeBlock
  sections: { under: string; bands: BandBlock[] }[]
  styles: OrganigramStyles
}) {
  return (
    <View style={[styles.section, boardPdfStyles.entryRule]}>
      <SheetText style={[styles.headingText, { marginBottom: 6 }]} minPresenceAhead={80}>
        {sanitizeText(committee.node.name)}
      </SheetText>
      <View style={styles.chart}>
        {committee.posts.map(post => {
          const branch = sections.find(section => section.under === post.name)
          return (
            <View key={post.id} style={styles.chartColumn}>
              <View style={styles.chartHead} wrap={false}>
                <Post post={post} styles={styles} />
              </View>
              {branch &&
                bandEntries(branch.bands).map(({ node, rows }) => (
                  <ChartService key={node.id} node={node} rows={rows} styles={styles} />
                ))}
            </View>
          )
        })}
      </View>
    </View>
  )
}

export function OrganigramDocument({
  tree,
  layout,
  title,
  congregationName,
  asOf,
  typeface,
  accentColor,
}: {
  tree: OrganigramNode[]
  layout: OrganigramLayout
  title: string
  congregationName: string
  asOf: string
  typeface: BoardTypeface
  accentColor: string
}) {
  const styles = makeOrganigramStyles(ORGANIGRAM_SIZE)
  const { rosters, committee, sections, legacy } = groupLayout(toLayout(tree))
  // In the chart, the posts' own branches sit in their columns; every other section follows.
  const postNames = new Set(layout === 'chart' && committee ? committee.posts.map(post => post.name) : [])
  const remaining = sections.filter(section => !postNames.has(section.under))

  return (
    <Document title={sanitizeText(title)}>
      <BoardPdfPage typeface={typeface} accentColor={accentColor}>
        <BoardPdfMasthead congregationName={congregationName} title={title} asOf={asOf} />

        {rosters.length > 0 && (
          <View style={styles.rosters}>
            {rosters.map(roster => (
              <Roster key={roster.id} block={roster} styles={styles} />
            ))}
          </View>
        )}

        {committee &&
          (layout === 'chart' ? (
            <Chart committee={committee} sections={sections} styles={styles} />
          ) : (
            <Committee block={committee} styles={styles} />
          ))}

        {remaining.map(section => (
          <Section
            key={section.under + String(section.bands[0]?.id ?? '')}
            under={section.under}
            bands={section.bands}
            styles={styles}
          />
        ))}

        {legacy.length > 0 && (
          <View style={[styles.section, boardPdfStyles.entryRule]}>
            {legacy.map(block => {
              if (block.kind === 'row') return <Line key={block.id} node={block.node} rows={null} styles={styles} />
              if (block.node) return <Line key={block.id} node={block.node} rows={block.rows} styles={styles} />
              return block.rows.map(row => <Line key={row.id} node={row} rows={null} styles={styles} />)
            })}
          </View>
        )}
      </BoardPdfPage>
    </Document>
  )
}
