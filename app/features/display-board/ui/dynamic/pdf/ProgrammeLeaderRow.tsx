import { Canvas, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import {
  LEADER_PAD,
  leaderLayout,
  PROGRAMME_LINE_HEIGHT,
  UNASSIGNED,
} from '~/features/display-board/model/programme-sheet'
import { SHEET_MARGIN } from '~/features/display-board/model/sheet-page'
import type { TextMeasurer, TextRun } from '~/features/display-board/model/sheet-text'
import * as m from '~/i18n/paraglide/messages'
import { BOARD_PDF_FAINT, boardPdfStyles, type PdfStyle, SheetText } from './board-pdf'

// A programme line: a part on the left, its assignee at the right edge, and a dotted leader
// between them drawn exactly where the measure says the part ends.

const DOT_PITCH = 0.34
const DOT_RADIUS = 0.055

const styles = StyleSheet.create({
  // Both sides sit on the last line, so the leader runs along it.
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
})

/** « Prénom NOM » runs, the first name muted as on the other board sheets. */
export function Who({ runs, style }: { runs: TextRun[]; style: PdfStyle }) {
  if (runs.length === 1 && runs[0].text === UNASSIGNED) {
    return <SheetText style={[style, { color: BOARD_PDF_FAINT }]}>{UNASSIGNED}</SheetText>
  }
  const anonymized = runs.length === 1 && runs[0].text === m.board_read_status_anonymized_user()
  return (
    <SheetText style={anonymized ? [style, boardPdfStyles.anonymized] : style}>
      {runs.map((run, index) => (
        <Text key={index} style={run.weight === 'bold' ? boardPdfStyles.bold : boardPdfStyles.muted}>
          {run.text}
        </Text>
      ))}
    </SheetText>
  )
}

/** Dots on the baseline, on a pitch shared by the whole page so every leader lines up. */
function Leader({
  from,
  to,
  pageX,
  measurer,
  s,
}: {
  from: number
  to: number
  pageX: number
  measurer: TextMeasurer
  s: number
}) {
  const pitch = DOT_PITCH * s
  const radius = DOT_RADIUS * s
  return (
    <Canvas
      style={{ position: 'absolute', left: from, right: to, bottom: 0, height: s * PROGRAMME_LINE_HEIGHT }}
      paint={(painter, width) => {
        const y = measurer.baseline * s - radius
        const origin = pageX + from
        for (let x = Math.ceil(origin / pitch) * pitch - origin; x <= width; x += pitch) painter.circle(x, y, radius)
        painter.fill(BOARD_PDF_FAINT)
        return null
      }}
    />
  )
}

export function LeaderRow({
  left,
  leftRuns,
  right,
  rightStyle,
  width,
  indent,
  measurer,
  s,
}: {
  /** Draws the left side; given its width when it wraps, and the lines it was measured on. */
  left: (style: PdfStyle, lines: string[] | null) => ReactNode
  leftRuns: TextRun[]
  right: TextRun[]
  rightStyle: PdfStyle
  width: number
  indent: number
  measurer: TextMeasurer
  s: number
}) {
  const layout = leaderLayout(leftRuns, right, width, measurer, s)
  const pad = LEADER_PAD * s
  return (
    <View style={styles.row}>
      {left(layout.leftBox ? { width: layout.leftBox } : { flexShrink: 0 }, layout.leftLines)}
      <Who
        runs={right}
        style={{ ...rightStyle, ...(layout.rightBox ? { width: layout.rightBox } : { flexShrink: 0 }) }}
      />
      <Leader
        from={layout.leftEnd + pad}
        to={layout.rightStart + pad}
        pageX={SHEET_MARGIN.horizontal + indent}
        measurer={measurer}
        s={s}
      />
    </View>
  )
}
