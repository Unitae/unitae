import { Document, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { BoardTypeface } from '~/features/display-board/model/board-appearance'
import {
  assigneeRuns,
  durationText,
  formatMeetingDate,
  memberRuns,
  PROGRAMME_LINE_HEIGHT,
  PROGRAMME_SIZE,
  type ProgrammeUnit,
  programmeUnits,
  sectionSheetColor,
  TRACK_INDENT,
  topicRuns,
  topicText,
  trackLabel,
  UNASSIGNED,
} from '~/features/display-board/model/programme-sheet'
import type {
  ProgrammeSheetEvent,
  ProgrammeSheetPart,
  ProgrammeSheetTemplateOptions,
} from '~/features/display-board/model/programme-sheet.type'
import { sheetContentBox } from '~/features/display-board/model/sheet-page'
import type { TextMeasurer } from '~/features/display-board/model/sheet-text'
import { groupPartsBySlot } from '~/features/events'
import { sanitizeText } from '~/shared/utils/sanitize-text'
import {
  BOARD_PDF_MUTED,
  BOARD_PDF_RULE,
  BoardPdfMasthead,
  BoardPdfPage,
  boardPdfStyles,
  type PdfStyle,
  SheetText,
} from './board-pdf'
import { LeaderRow, Who } from './ProgrammeLeaderRow'

// The printable programme: one meeting after another across the page, each part on a dotted
// leader to its assignee at the right edge, the services in a grid underneath. A meeting never
// breaks across pages, so its date can never sit alone at the bottom of one.

const CONTENT_WIDTH = sheetContentBox('portrait').width

function makeStyles(s: number) {
  const k = s / 10
  const text = { fontSize: s, lineHeight: PROGRAMME_LINE_HEIGHT }
  return StyleSheet.create({
    text,
    muted: { ...text, color: BOARD_PDF_MUTED },
    right: { ...text, textAlign: 'right' },
    templateHeading: {
      fontSize: 1.6 * s,
      lineHeight: PROGRAMME_LINE_HEIGHT,
      fontWeight: 'bold',
      marginTop: 6 * k,
      marginBottom: 8 * k,
    },
    meeting: { marginBottom: 12 * k },
    heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 * k },
    date: { fontSize: 1.4 * s, lineHeight: PROGRAMME_LINE_HEIGHT, fontWeight: 'bold' },
    eventName: { ...text, color: BOARD_PDF_MUTED, marginLeft: 8, flexShrink: 1, textAlign: 'right' },
    section: { ...text, fontWeight: 'bold', marginTop: 6 * k },
    part: { marginTop: 2 * k },
    track: { marginLeft: TRACK_INDENT },
    services: { marginTop: 6 * k, paddingTop: 4 * k, borderTopWidth: 0.75, borderTopColor: BOARD_PDF_RULE },
    serviceGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    gridService: { width: '50%', flexDirection: 'row', paddingVertical: 1.5 * k, paddingRight: 10 },
    gridServiceName: { ...text, width: '40%', color: BOARD_PDF_MUTED },
    gridServiceWho: { ...text, width: '60%' },
  })
}

type Styles = ReturnType<typeof makeStyles>

interface Fit {
  measurer: TextMeasurer
  timezone: string
  styles: Styles
}

/** The topic, on the lines it was measured on when it had to wrap, its duration in grey. */
function Topic({ part, lines, style }: { part: ProgrammeSheetPart; lines?: string[] | null; style: PdfStyle }) {
  const duration = durationText(part)
  const topic = lines ? lines.join('\n').slice(0, duration.length > 0 ? -duration.length : undefined) : topicText(part)
  return (
    <SheetText style={style}>
      {topic}
      {duration && <Text style={boardPdfStyles.muted}>{duration}</Text>}
    </SheetText>
  )
}

function Meeting({ unit, first, fit }: { unit: ProgrammeUnit; first: boolean; fit: Fit }) {
  const { styles, measurer } = fit
  const s = PROGRAMME_SIZE
  return (
    <View style={first ? styles.meeting : [styles.meeting, boardPdfStyles.entryRule]} wrap={false}>
      <View style={styles.heading}>
        <SheetText style={styles.date}>{formatMeetingDate(unit.event.startDate, fit.timezone)}</SheetText>
        <SheetText style={styles.eventName}>{sanitizeText(unit.event.name)}</SheetText>
      </View>
      {unit.showParts &&
        groupPartsBySlot(unit.event.eventParts).map((group, groupIndex) => (
          <View key={groupIndex}>
            {group.section !== '' && (
              <SheetText style={[styles.section, { color: sectionSheetColor(group.section, BOARD_PDF_MUTED) }]}>
                {sanitizeText(group.section)}
              </SheetText>
            )}
            {group.slots.map((slot, slotIndex) =>
              slot.parts.length === 1 ? (
                <View key={slotIndex} style={styles.part}>
                  <LeaderRow
                    left={(style, lines) => (
                      <Topic part={slot.parts[0]} lines={lines} style={{ ...styles.text, ...style }} />
                    )}
                    leftRuns={topicRuns(slot.parts[0])}
                    right={assigneeRuns(slot.parts[0])}
                    rightStyle={styles.right}
                    width={CONTENT_WIDTH}
                    indent={0}
                    measurer={measurer}
                    s={s}
                  />
                </View>
              ) : (
                <View key={slotIndex} style={styles.part}>
                  <Topic part={slot.parts[0]} style={styles.text} />
                  {slot.parts.map((part, index) => (
                    <View key={part.id} style={styles.track}>
                      <LeaderRow
                        left={style => (
                          <SheetText style={{ ...styles.muted, ...style }}>{trackLabel(part, index)}</SheetText>
                        )}
                        leftRuns={[{ text: trackLabel(part, index), weight: 'regular' }]}
                        right={assigneeRuns(part)}
                        rightStyle={styles.right}
                        width={CONTENT_WIDTH - TRACK_INDENT}
                        indent={TRACK_INDENT}
                        measurer={measurer}
                        s={s}
                      />
                    </View>
                  ))}
                </View>
              ),
            )}
          </View>
        ))}
      {unit.services.length > 0 && (
        <View style={[styles.services, styles.serviceGrid]}>
          {unit.services.map((service, index) => (
            <View key={index} style={styles.gridService}>
              <SheetText style={styles.gridServiceName}>{sanitizeText(service.name)}</SheetText>
              <Who
                runs={service.assignee ? memberRuns(service.assignee) : [{ text: UNASSIGNED, weight: 'regular' }]}
                style={styles.gridServiceWho}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

export function ProgrammeDocument({
  events,
  configMap,
  groupBy,
  title,
  congregationName,
  asOf,
  timezone,
  typeface,
  accentColor,
  measurer,
}: {
  events: ProgrammeSheetEvent[]
  configMap: Map<number, ProgrammeSheetTemplateOptions>
  groupBy: 'date' | 'template'
  title: string
  congregationName: string
  asOf: string
  timezone: string
  typeface: BoardTypeface
  accentColor: string
  measurer: TextMeasurer
}) {
  const fit: Fit = { measurer, timezone, styles: makeStyles(PROGRAMME_SIZE) }
  return (
    <Document title={sanitizeText(title)}>
      <BoardPdfPage typeface={typeface} accentColor={accentColor}>
        <BoardPdfMasthead congregationName={congregationName} title={title} asOf={asOf} />
        {programmeUnits(events, configMap, groupBy).map((unit, index) => (
          <View key={index}>
            {unit.templateHeading && (
              <SheetText style={fit.styles.templateHeading} minPresenceAhead={120}>
                {sanitizeText(unit.templateHeading)}
              </SheetText>
            )}
            <Meeting unit={unit} first={index === 0 || unit.templateHeading != null} fit={fit} />
          </View>
        ))}
      </BoardPdfPage>
    </Document>
  )
}
