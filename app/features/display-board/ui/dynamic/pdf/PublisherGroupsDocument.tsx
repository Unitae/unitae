import { Document, StyleSheet, View } from '@react-pdf/renderer'
import type { BoardTypeface } from '~/features/display-board/model/board-appearance'
import {
  GROUP_GAP,
  GROUPS_LINE_HEIGHT,
  type GroupsGeometry,
  type GroupsRow,
  type GroupsSheetPlan,
  groupCountLabel,
  groupSheetName,
  leadersOf,
  type SheetPublisherGroup,
} from '~/features/display-board/model/publisher-groups-sheet'
import { sanitizeText } from '~/shared/utils/sanitize-text'
import {
  BOARD_PDF_MUTED,
  BOARD_PDF_RULE,
  BoardPdfLabel,
  BoardPdfMasthead,
  BoardPdfPage,
  BoardPdfPersonName,
  boardPdfStyles,
  SheetText,
} from './board-pdf'

// The printable « Groupes de prédication », drawn from the plan `fitGroupsSheet` made: its size,
// its sheets and the column each name falls in. See the planner for the three layouts.

function makeStyles(s: number, geometry: GroupsGeometry) {
  const k = s / 10
  return StyleSheet.create({
    text: { fontSize: s, lineHeight: GROUPS_LINE_HEIGHT },
    muted: { fontSize: s, lineHeight: GROUPS_LINE_HEIGHT, color: BOARD_PDF_MUTED },
    groupName: { fontSize: geometry.head.size, lineHeight: GROUPS_LINE_HEIGHT, fontWeight: 'bold' },
    entry: { marginBottom: GROUP_GAP * k },
    heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    leaders: {
      marginTop: 3 * k,
      marginBottom: 4 * k,
      paddingBottom: 4 * k,
      borderBottomWidth: 0.75,
      borderBottomColor: BOARD_PDF_RULE,
    },
    bandLeaders: { marginTop: 5 * k },
    leaderInline: { flexDirection: 'row' },
    role: { width: geometry.role, fontSize: s, lineHeight: GROUPS_LINE_HEIGHT },
    names: { flexDirection: 'row', gap: geometry.nameGap },
    nameColumn: { flex: 1 },
    row: { flexDirection: 'row', gap: geometry.gap },
    cell: { flex: 1 },
    index: { width: geometry.index },
  })
}

type Styles = ReturnType<typeof makeStyles>

function Leaders({
  group,
  styles,
  layout,
}: {
  group: SheetPublisherGroup
  styles: Styles
  layout: GroupsGeometry['layout']
}) {
  // Directory sets each title in a narrow column beside its name; the others stack them.
  const inline = layout === 'directory'
  return (
    <View style={layout === 'bands' ? styles.bandLeaders : styles.leaders}>
      {leadersOf(group).map(({ label, person }) => (
        <View key={label} style={inline ? styles.leaderInline : {}}>
          <BoardPdfLabel style={inline ? styles.role : styles.text}>{label}</BoardPdfLabel>
          <BoardPdfPersonName person={person} style={inline ? { ...styles.text, flex: 1 } : styles.text} />
        </View>
      ))}
    </View>
  )
}

function Names({ group, plan, styles }: { group: SheetPublisherGroup; plan: GroupsSheetPlan; styles: Styles }) {
  return (
    <View style={styles.names}>
      {plan.nameColumns(group).map((column, index) => (
        <View key={index} style={styles.nameColumn}>
          {column.map(person => (
            <BoardPdfPersonName key={person.id} person={person} style={styles.text} />
          ))}
        </View>
      ))}
    </View>
  )
}

/** Directory entry: the name with its head count beside it, the address, the leaders, everyone else. */
function DirectoryEntry({
  group,
  first,
  oversized,
  plan,
  styles,
}: {
  group: SheetPublisherGroup
  first: boolean
  oversized: boolean
  plan: GroupsSheetPlan
  styles: Styles
}) {
  return (
    <View style={first ? styles.entry : [styles.entry, boardPdfStyles.entryRule]} wrap={oversized}>
      <View wrap={false} minPresenceAhead={oversized ? 60 : 0}>
        <View style={styles.heading}>
          <SheetText style={[styles.groupName, { maxWidth: '74%' }]}>{groupSheetName(group)}</SheetText>
          <SheetText style={[styles.muted, { marginLeft: 8 }]}>{groupCountLabel(group)}</SheetText>
        </View>
        <SheetText style={styles.muted}>{sanitizeText(group.adress)}</SheetText>
        <Leaders group={group} styles={styles} layout="directory" />
      </View>
      <Names group={group} plan={plan} styles={styles} />
    </View>
  )
}

function Directory({ row, plan, styles }: { row: GroupsRow; plan: GroupsSheetPlan; styles: Styles }) {
  return (
    <View style={styles.row}>
      {row.columns.map((column, columnIndex) => (
        <View key={columnIndex} style={styles.cell}>
          {column.map((group, index) => (
            <DirectoryEntry
              key={group.id}
              group={group}
              first={index === 0}
              oversized={row.oversized}
              plan={plan}
              styles={styles}
            />
          ))}
        </View>
      ))}
    </View>
  )
}

/** Columns: each group heads its own column, on a rule, everyone else listed beneath. */
function ColumnsRow({ row, plan, styles }: { row: GroupsRow; plan: GroupsSheetPlan; styles: Styles }) {
  const { perRow } = plan.geometry
  const groups = row.columns.map(([group]) => group)
  return (
    <View style={[styles.row, styles.entry]} wrap={row.oversized}>
      {Array.from({ length: perRow }, (_, index) => groups[index]).map((group, index) =>
        group ? (
          <View key={group.id} style={[styles.cell, boardPdfStyles.entryRule]}>
            {/* The leaders sit on the row's common rule, whatever the name and address above take. */}
            <View style={{ minHeight: row.headHeight, justifyContent: 'space-between' }} wrap={false}>
              <View>
                <SheetText style={styles.groupName}>{groupSheetName(group)}</SheetText>
                <SheetText style={styles.muted}>{groupCountLabel(group)}</SheetText>
                <SheetText style={styles.muted}>{sanitizeText(group.adress)}</SheetText>
              </View>
              <Leaders group={group} styles={styles} layout="columns" />
            </View>
            <Names group={group} plan={plan} styles={styles} />
          </View>
        ) : (
          <View key={`empty-${index}`} style={styles.cell} />
        ),
      )}
    </View>
  )
}

/** Bands: the group's name, head count, address and leaders on the left; everyone else in three columns. */
function Band({ row, first, plan, styles }: { row: GroupsRow; first: boolean; plan: GroupsSheetPlan; styles: Styles }) {
  const [[group]] = row.columns
  return (
    <View style={[styles.row, styles.entry, ...(first ? [] : [boardPdfStyles.entryRule])]} wrap={row.oversized}>
      <View style={styles.index} wrap={false}>
        <SheetText style={styles.groupName}>{groupSheetName(group)}</SheetText>
        <SheetText style={styles.muted}>{groupCountLabel(group)}</SheetText>
        <SheetText style={styles.muted}>{sanitizeText(group.adress)}</SheetText>
        <Leaders group={group} styles={styles} layout="bands" />
      </View>
      <View style={styles.cell}>
        <Names group={group} plan={plan} styles={styles} />
      </View>
    </View>
  )
}

export function PublisherGroupsDocument({
  plan,
  title,
  congregationName,
  asOf,
  typeface,
  accentColor,
}: {
  plan: GroupsSheetPlan
  title: string
  congregationName: string
  asOf: string
  typeface: BoardTypeface
  accentColor: string
}) {
  const { geometry } = plan
  const styles = makeStyles(plan.size, geometry)
  return (
    <Document title={sanitizeText(title)}>
      <BoardPdfPage typeface={typeface} accentColor={accentColor} orientation={geometry.orientation}>
        <BoardPdfMasthead congregationName={congregationName} title={title} asOf={asOf} />
        {plan.sheets.map((sheet, sheetIndex) => (
          <View key={sheet[0]?.columns[0]?.[0]?.id ?? sheetIndex} break={sheetIndex > 0}>
            {sheet.map((row, rowIndex) => {
              const key = row.columns[0]?.[0]?.id ?? rowIndex
              if (geometry.layout === 'directory') return <Directory key={key} row={row} plan={plan} styles={styles} />
              if (geometry.layout === 'columns') return <ColumnsRow key={key} row={row} plan={plan} styles={styles} />
              return <Band key={key} row={row} first={rowIndex === 0} plan={plan} styles={styles} />
            })}
          </View>
        ))}
      </BoardPdfPage>
    </Document>
  )
}
