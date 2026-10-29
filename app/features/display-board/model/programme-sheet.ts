import type {
  ProgrammeSheetEvent,
  ProgrammeSheetMember,
  ProgrammeSheetPart,
  ProgrammeSheetTemplateOptions,
} from '~/features/display-board/model/programme-sheet.type'
import { runsWidth, type TextMeasurer, type TextRun, wrapLines } from '~/features/display-board/model/sheet-text'
import * as m from '~/i18n/paraglide/messages'
import { formatEventDate } from '~/shared/utils/event-time'
import { sanitizeText } from '~/shared/utils/sanitize-text'

// What the printable programme prints, line by line, before react-pdf draws it: one meeting after
// another, each part on a dotted leader to its assignee at the right edge, the services in a grid
// underneath. One description of each line feeds both the measuring and the drawing.

export const PROGRAMME_SIZE = 10.5
export const PROGRAMME_LINE_HEIGHT = 1.25
export const TRACK_INDENT = 12

// The workbook's own section colours, which members recognise.
const SECTION_COLOR_RULES: [string, string][] = [
  ['joyaux', '#5B6770'],
  ['minist', '#B07818'],
  ['chr', '#942926'],
]

export function sectionSheetColor(section: string, fallback: string): string {
  const lower = section.toLowerCase()
  return SECTION_COLOR_RULES.find(([pattern]) => lower.includes(pattern))?.[1] ?? fallback
}

/** « Mercredi 7 octobre », in the congregation's timezone. */
export function formatMeetingDate(date: Date, timezone: string): string {
  const text = formatEventDate(date, timezone, 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  return text.charAt(0).toLocaleUpperCase('fr') + text.slice(1)
}

// ── Runs ───────────────────────────────────────────────────────────────

/** An unassigned part or service. */
export const UNASSIGNED = '—'

export function memberRuns(member: ProgrammeSheetMember): TextRun[] {
  if (member.anonymizedAt != null) return [{ text: m.board_read_status_anonymized_user(), weight: 'regular' }]
  return [
    ...(member.firstname ? [{ text: `${sanitizeText(member.firstname)} `, weight: 'regular' as const }] : []),
    ...(member.lastname
      ? [{ text: sanitizeText(member.lastname).toLocaleUpperCase('fr'), weight: 'bold' as const }]
      : []),
  ]
}

export function assigneeRuns(part: ProgrammeSheetPart): TextRun[] {
  if (part.externalSpeaker) return [{ text: sanitizeText(part.externalSpeaker.name), weight: 'regular' }]
  if (!part.assignee) return [{ text: UNASSIGNED, weight: 'regular' }]
  return [
    ...memberRuns(part.assignee),
    ...(part.assistant ? [{ text: ' et ', weight: 'regular' as const }, ...memberRuns(part.assistant)] : []),
  ]
}

// French punctuation keeps its space: « ? » never starts a line, nor « » » end one alone.
export function frenchSpacing(text: string): string {
  return text.replace(/\s+([?!:;»])/g, ' $1').replace(/«\s+/g, '« ')
}

export function topicText(part: ProgrammeSheetPart): string {
  return frenchSpacing(sanitizeText(part.topic !== '' ? part.topic : part.name))
}

// A no-break space ties « 10 min » to the topic's last word: it never starts a line alone.
export function durationText(part: ProgrammeSheetPart): string {
  return part.durationMin != null ? ` ${part.durationMin} min` : ''
}

/** The topic and its duration as one run: same weight, so the same width as the two printed. */
export function topicRuns(part: ProgrammeSheetPart): TextRun[] {
  return [{ text: topicText(part) + durationText(part), weight: 'regular' }]
}

export function trackLabel(part: ProgrammeSheetPart, index: number): string {
  return sanitizeText(part.track) || `Salle ${index + 1}`
}

// ── Meetings ───────────────────────────────────────────────────────────

export interface ProgrammeUnit {
  event: ProgrammeSheetEvent
  /** Grouped by template, the template's first meeting opens with its name. */
  templateHeading: string | null
  showParts: boolean
  services: { name: string; assignee?: ProgrammeSheetMember | null }[]
}

export function programmeUnits(
  events: ProgrammeSheetEvent[],
  configMap: Map<number, ProgrammeSheetTemplateOptions>,
  groupBy: 'date' | 'template',
): ProgrammeUnit[] {
  const ordered =
    groupBy === 'template'
      ? [...events].sort((a, b) => {
          const nameA = a.template?.name ?? ''
          const nameB = b.template?.name ?? ''
          if (nameA !== nameB) return nameA.localeCompare(nameB)
          return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        })
      : events
  const seen = new Set<number>()
  return ordered.map(event => {
    const config = event.templateId ? configMap.get(event.templateId) : null
    let templateHeading: string | null = null
    if (groupBy === 'template' && event.templateId && !seen.has(event.templateId)) {
      seen.add(event.templateId)
      templateHeading = event.template?.name ?? null
    }
    return {
      event,
      templateHeading,
      showParts: config?.parts ?? true,
      services: (config?.services ?? true) ? (event.eventServiceParts ?? []) : [],
    }
  })
}

// ── Leader rows ────────────────────────────────────────────────────────
// A part on the left, its assignee at the right edge, faint dots between. When both don't fit on
// one line, the part wraps in what the assignee leaves it, and the assignee and the leader sit on
// the part's last line. A wrapped part gets its line breaks from the measure, so react-pdf sets
// exactly the lines measured and the leader starts where the last one ends.

// The shortest leader worth drawing and the space either side of it, × the size.
export const LEADER_MIN = 2.5
export const LEADER_PAD = 0.4
// Past this share of the line, an assignee wraps too rather than squeeze the part.
const WHO_MAX = 0.55
// What react-pdf may set beyond a measured line before it would wrap it again on its own.
const SLACK = 1.04

export interface LeaderLayout {
  /** The part's lines when it wraps; null when the row holds on one line. */
  leftLines: string[] | null
  leftBox: number | null
  rightBox: number | null
  /** Where the part's last line ends, from the row's left edge. */
  leftEnd: number
  /** How far the assignee's last line reaches in from the row's right edge. */
  rightStart: number
}

export function leaderLayout(
  left: TextRun[],
  right: TextRun[],
  width: number,
  measurer: TextMeasurer,
  s: number,
): LeaderLayout {
  const pad = LEADER_PAD * s
  const leftWidth = runsWidth(left, measurer, s)
  const rightWidth = runsWidth(right, measurer, s)
  if (leftWidth + 2 * pad + LEADER_MIN * s + rightWidth <= width) {
    return { leftLines: null, leftBox: null, rightBox: null, leftEnd: leftWidth, rightStart: rightWidth }
  }
  const rightWraps = rightWidth > WHO_MAX * width
  const rightBox = rightWraps ? WHO_MAX * width : rightWidth
  const leftBox = width - rightBox - 2 * pad - LEADER_MIN * s
  const leftLines = wrapLines(left, measurer, s, leftBox)
  const rightLines = wrapLines(right, measurer, s, rightBox)
  return {
    leftLines: leftLines.map(line => line.text),
    leftBox: leftBox * SLACK,
    rightBox: rightWraps ? rightBox : rightBox * SLACK,
    leftEnd: leftLines[leftLines.length - 1].width,
    rightStart: rightWraps ? rightLines[rightLines.length - 1].width : rightWidth,
  }
}
