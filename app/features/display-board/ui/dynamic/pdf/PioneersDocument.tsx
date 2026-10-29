import { Document, StyleSheet, View } from '@react-pdf/renderer'
import type { BoardTypeface } from '~/features/display-board/model/board-appearance'
import {
  PIONEERS_GAP,
  PIONEERS_HEADING_SCALE,
  PIONEERS_LINE_HEIGHT,
  type PioneersLayout,
  type PioneersSection,
  type PioneersSheetPlan,
} from '~/features/display-board/model/pioneers-sheet'
import { sanitizeText } from '~/shared/utils/sanitize-text'
import {
  BOARD_PDF_MUTED,
  BoardPdfMasthead,
  BoardPdfPage,
  BoardPdfPersonName,
  boardPdfStyles,
  SheetText,
} from './board-pdf'

// The printable « Pionniers », drawn from the plan `fitPioneersSheet` made: its size and the
// column each name falls in. See the planner for the two layouts.

function makeStyles(s: number) {
  return StyleSheet.create({
    section: { marginBottom: 16 },
    heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
    title: { fontSize: PIONEERS_HEADING_SCALE * s, lineHeight: 1.2, fontWeight: 'bold', maxWidth: '82%' },
    count: { fontSize: s, color: BOARD_PDF_MUTED },
    names: { flexDirection: 'row', gap: PIONEERS_GAP },
    nameColumn: { flex: 1 },
    name: { fontSize: s, lineHeight: PIONEERS_LINE_HEIGHT },
  })
}

type Styles = ReturnType<typeof makeStyles>

function Heading({ section, styles, minHeight }: { section: PioneersSection; styles: Styles; minHeight?: number }) {
  return (
    <View style={[styles.heading, { minHeight }]} wrap={false} minPresenceAhead={40}>
      <SheetText style={styles.title}>{sanitizeText(section.label)}</SheetText>
      <SheetText style={styles.count}>{section.pioneers.length}</SheetText>
    </View>
  )
}

function Columns({ section, styles, width }: { section: PioneersSection; styles: Styles; width?: number }) {
  return (
    <View style={styles.names}>
      {section.columns.map((column, index) => (
        <View key={index} style={width ? { width } : styles.nameColumn}>
          {column.map(pioneer => (
            <BoardPdfPersonName key={pioneer.id} person={pioneer} style={styles.name} />
          ))}
        </View>
      ))}
    </View>
  )
}

export function PioneersDocument({
  plan,
  layout,
  title,
  congregationName,
  asOf,
  typeface,
  accentColor,
}: {
  plan: PioneersSheetPlan
  layout: PioneersLayout
  title: string
  congregationName: string
  asOf: string
  typeface: BoardTypeface
  accentColor: string
}) {
  const styles = makeStyles(plan.size)
  // A type's block spans its columns of names and the gaps between them.
  const blockWidth = (section: PioneersSection) =>
    plan.columnWidth * section.columns.length + PIONEERS_GAP * (section.columns.length - 1)

  return (
    <Document title={sanitizeText(title)}>
      <BoardPdfPage typeface={typeface} accentColor={accentColor}>
        <BoardPdfMasthead congregationName={congregationName} title={title} asOf={asOf} />
        {layout === 'sections' &&
          plan.sections.map((section, index) => (
            <View
              key={section.type}
              style={index === 0 ? styles.section : [styles.section, boardPdfStyles.entryRule]}
              wrap={!plan.fitsOnePage}
            >
              <Heading section={section} styles={styles} />
              <Columns section={section} styles={styles} />
            </View>
          ))}
        {layout === 'columns' && (
          <View style={styles.names}>
            {plan.sections.map(section => (
              <View key={section.type} style={[{ width: blockWidth(section) }, boardPdfStyles.entryRule]}>
                <Heading section={section} styles={styles} minHeight={plan.headingHeight} />
                <Columns section={section} styles={styles} width={plan.columnWidth} />
              </View>
            ))}
          </View>
        )}
      </BoardPdfPage>
    </Document>
  )
}
