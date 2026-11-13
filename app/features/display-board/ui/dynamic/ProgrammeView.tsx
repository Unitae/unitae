import { Tag } from '@unitae/ui'
import { Calendar, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { partMatches } from '~/features/display-board/model/board-reader'
import type { ProgrammeDynamicConfig } from '~/features/display-board/model/dynamic-document.type'
import { programmePdfOptions } from '~/features/display-board/model/programme-pdf-options'
import {
  formatMeetingDate,
  type ProgrammeUnit,
  programmeUnits,
  topicText,
  trackLabel,
} from '~/features/display-board/model/programme-sheet'
import { programmeWeeks } from '~/features/display-board/model/programme-weeks'
import { groupPartsBySlot, sectionColor } from '~/features/events'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { usePersistedState } from '~/shared/ui/hooks/use-persisted-state'
import { dayOf } from '~/shared/utils/calendar-day'
import type { ExternalSpeakerLabelSource } from '~/shared/utils/external-speaker-label'
import { cn } from '~/shared/utils/utils'
import { BoardPersonName, BoardSpeakerName } from './BoardPersonName'
import { DocLink, useBoardReading } from './board-reading'

// The board's programme on screen, composed as its printed sheet: each meeting under a rule, its
// date and kind on one line, each part with its people at the right, the workbook's section
// colours on their labels, the services underneath. It opens on the week under way, the weeks
// already over folded above it, and shares the sheet's own pipeline (`programmeUnits`,
// `formatMeetingDate`, `groupPartsBySlot`) so the two never disagree on what a meeting shows.

interface Person {
  id: number
  firstname: string | null
  lastname: string | null
  anonymizedAt: Date | null
}

interface PartAssignment {
  id: number
  name: string
  section: string
  track: string
  order: number
  topic: string
  durationMin: number | null
  externalSpeaker: ExternalSpeakerLabelSource | null
  assignee: Person | null
  assistant: Person | null
}

interface ProgrammeEvent {
  id: number
  name: string
  startDate: Date
  templateId: number | null
  template?: { name: string } | null
  eventParts: PartAssignment[]
  eventServiceParts?: { id: number; name: string; assignee?: Person | null }[]
}

export interface ProgrammeViewData {
  events: ProgrammeEvent[]
  showServices: boolean
  config: ProgrammeDynamicConfig | null
  /** When the programme is read, from the server: the week under way and the past meetings follow it. */
  now: Date
  timeZone: string
}

type Unit = ProgrammeUnit<ProgrammeEvent>

/** « 9 nov. » for the week rail, « 9 novembre » for the week's heading. */
function mondayLabel(monday: string, month: 'short' | 'long'): string {
  return new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month, timeZone: 'UTC' }).format(
    new Date(`${monday}T12:00:00Z`),
  )
}

function Assignees({ part }: { part: PartAssignment }) {
  if (part.externalSpeaker) {
    return (
      <>
        <BoardSpeakerName speaker={part.externalSpeaker} />
        <Tag className="ml-2 shrink-0 font-sans">{m.programs_view_external_badge()}</Tag>
      </>
    )
  }
  if (!part.assignee) return <span className="text-muted-foreground">—</span>
  return (
    <>
      <BoardPersonName person={part.assignee} />
      {part.assistant && (
        <>
          {' '}
          {m.board_programme_and()} <BoardPersonName person={part.assistant} />
        </>
      )}
    </>
  )
}

/** The part's own name fades under a search that lights up none of its people; the names fade on their own. */
function useTopicDimmed(parts: PartAssignment[]): boolean {
  const { query } = useBoardReading()
  if (query == null) return false
  return !parts.some(part => partMatches(part, query))
}

function Topic({ part, dimmed }: { part: PartAssignment; dimmed: boolean }) {
  return (
    <span className={cn(dimmed && 'opacity-30 print:opacity-100')}>
      {topicText(part)}
      {part.durationMin != null && <span className="ml-1.5 text-muted-foreground text-sm">{part.durationMin} min</span>}
    </span>
  )
}

function PartRow({ part }: { part: PartAssignment }) {
  const dimmed = useTopicDimmed([part])
  return (
    <div className="grid items-baseline gap-x-6 border-border border-b py-1.5 sm:grid-cols-[minmax(0,1fr)_auto]">
      <Topic part={part} dimmed={dimmed} />
      <span className="sm:text-right">
        <Assignees part={part} />
      </span>
    </div>
  )
}

/** A part held in several rooms at once: its name, then each room with its people. */
function TrackedPart({ parts }: { parts: PartAssignment[] }) {
  const dimmed = useTopicDimmed(parts)
  return (
    <div className="flex flex-col border-border border-b py-1.5">
      <Topic part={parts[0]} dimmed={dimmed} />
      {parts.map((part, index) => (
        <div key={part.id} className="grid items-baseline gap-x-6 pt-0.5 pl-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <span className="text-muted-foreground text-sm">{trackLabel(part, index)}</span>
          <span className="sm:text-right">
            <Assignees part={part} />
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * The services in two columns; under a meeting's parts they fold away, a choice the reader's browser
 * keeps. A search opens them, so every name it counts is in sight, and paper always prints them.
 */
function Services({
  services,
  hasParts,
}: {
  services: NonNullable<ProgrammeEvent['eventServiceParts']>
  hasParts: boolean
}) {
  const { query } = useBoardReading()
  const [collapsed, setCollapsed] = usePersistedState('programme-services-collapsed', false)
  const label = m.board_viewer_services_label({ count: String(services.length) })
  const folded = hasParts && collapsed && query == null
  return (
    <div className="mt-3 flex flex-col">
      {hasParts ? (
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!folded}
          disabled={query != null}
          className="flex items-center gap-1 self-start font-bold text-muted-foreground text-sm"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn('size-4 transition-transform print:hidden', !folded && 'rotate-90')}
          />
          {label}
        </button>
      ) : (
        <p className="font-bold text-muted-foreground text-sm">{label}</p>
      )}
      <div className={cn('grid gap-x-8 sm:grid-cols-2', folded && 'hidden print:grid')}>
        {services.map(service => (
          <div
            key={service.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-border border-b py-1 text-sm"
          >
            <span className="text-muted-foreground">{service.name}</span>
            {service.assignee ? (
              <BoardPersonName person={service.assignee} />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Meeting({ unit, past, timeZone }: { unit: Unit; past: boolean; timeZone: string }) {
  const { reader } = useBoardReading()
  const date = formatMeetingDate(unit.event.startDate, timeZone)
  return (
    <section
      className={cn('flex flex-col border-foreground border-t-[1.5px] pt-2', past && 'opacity-55 print:opacity-100')}
    >
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h3 className="font-bold text-xl leading-snug">
          {reader?.canViewPrograms ? (
            <DocLink to={`/programs/events/${unit.event.id}`} title={m.board_viewer_open_programme()}>
              {date}
            </DocLink>
          ) : (
            date
          )}
        </h3>
        {past && <span className="text-muted-foreground text-sm print:hidden">{m.board_programme_past()}</span>}
        <span className="ml-auto text-muted-foreground text-sm">{unit.event.name}</span>
      </div>
      {unit.showParts &&
        groupPartsBySlot(unit.event.eventParts).map(group => (
          <div key={`${group.section}-${group.slots[0]?.parts[0]?.id ?? 0}`} className="flex flex-col">
            {group.section !== '' && (
              <p className="mt-3 font-bold text-sm" style={{ color: sectionColor(group.section) }}>
                {group.section}
              </p>
            )}
            {group.slots.map(slot =>
              slot.parts.length === 1 ? (
                <PartRow key={slot.parts[0].id} part={slot.parts[0]} />
              ) : (
                <TrackedPart key={slot.parts[0].id} parts={slot.parts} />
              ),
            )}
          </div>
        ))}
      {unit.services.length > 0 && <Services services={unit.services} hasParts={unit.showParts} />}
    </section>
  )
}

/** The week rail: a link per week, the one under way in ink and underlined; a folded week unfolds first. */
function WeekRail({
  weeks,
  onOpenPast,
}: {
  weeks: { monday: string; current: boolean; past: boolean }[]
  onOpenPast: () => void
}) {
  const go = (monday: string, past: boolean) => {
    if (past) onOpenPast()
    requestAnimationFrame(() => document.getElementById(`week-${monday}`)?.scrollIntoView({ block: 'start' }))
  }
  return (
    <nav
      aria-label={m.board_programme_weeks_label()}
      className="sticky top-0 z-10 flex gap-x-4 gap-y-1 overflow-x-auto whitespace-nowrap border-border border-b bg-background/95 py-2 font-sans text-sm backdrop-blur-sm md:flex-wrap print:hidden"
    >
      {weeks.map(week => (
        <a
          key={week.monday}
          href={`#week-${week.monday}`}
          aria-current={week.current ? 'date' : undefined}
          onClick={event => {
            event.preventDefault()
            go(week.monday, week.past)
          }}
          className={cn(
            'underline-offset-[6px] hover:text-foreground hover:underline',
            week.current
              ? 'font-semibold text-foreground underline decoration-2'
              : week.past
                ? 'text-muted-foreground/80'
                : 'text-muted-foreground',
          )}
        >
          {mondayLabel(week.monday, 'short')}
        </a>
      ))}
    </nav>
  )
}

export function ProgrammeView({ events, showServices, config, now, timeZone }: ProgrammeViewData) {
  const { query } = useBoardReading()
  const [showPast, setShowPast] = useState(false)

  if (events.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title={m.board_dynamic_programme_empty_title()}
        description={m.board_dynamic_programme_empty_description()}
      />
    )
  }

  const { configMap, groupBy } = programmePdfOptions({ events, config, showServices })
  const units = programmeUnits(events, configMap, groupBy)
  const today = dayOf(new Date(now), timeZone)
  const isPast = (unit: Unit) => dayOf(unit.event.startDate, timeZone) < today

  // Grouped by template, the meetings read template by template: no weeks to fold.
  if (groupBy === 'template') {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 pt-4 pb-12 md:px-6">
        {units.map(unit => (
          <div key={unit.event.id} className="flex flex-col gap-3">
            {unit.templateHeading && <h2 className="mt-4 font-bold text-2xl">{unit.templateHeading}</h2>}
            <Meeting unit={unit} past={isPast(unit)} timeZone={timeZone} />
          </div>
        ))}
      </div>
    )
  }

  const weeks = programmeWeeks(units, new Date(now), timeZone)
  const pastWeeks = weeks.filter(week => week.past)
  // The weeks already over fold away above the one under way — unless nothing is left after them
  // (a deep link to an old meeting), or a search is looking through everything.
  const foldable = pastWeeks.length > 0 && weeks.some(week => !week.past) && query == null
  const folded = foldable && !showPast
  const pastCount = pastWeeks.reduce((sum, week) => sum + week.units.length, 0)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 pt-2 pb-12 md:px-6">
      {weeks.length > 1 && <WeekRail weeks={weeks} onOpenPast={() => setShowPast(true)} />}
      {foldable && (
        <div className="flex items-center gap-3 border-border border-b pb-2 font-sans text-muted-foreground text-sm print:hidden">
          <span className="flex-1">
            {pastCount === 1
              ? m.board_programme_past_meetings_one()
              : m.board_programme_past_meetings_other({ count: String(pastCount) })}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setShowPast(!showPast)} aria-expanded={!folded}>
            {folded ? m.board_programme_show_past() : m.board_programme_hide_past()}
          </Button>
        </div>
      )}
      {weeks
        .filter(week => !(folded && week.past))
        .map(week => (
          <section key={week.monday} id={`week-${week.monday}`} className="flex scroll-mt-14 flex-col gap-5">
            <h2 className="flex items-baseline gap-2 font-sans text-muted-foreground text-sm">
              <span className="font-semibold text-base text-foreground">
                {m.board_programme_week_of({ date: mondayLabel(week.monday, 'long') })}
              </span>
              {week.current && <span>{m.board_programme_this_week()}</span>}
            </h2>
            {week.units.map(unit => (
              <Meeting key={unit.event.id} unit={unit} past={isPast(unit)} timeZone={timeZone} />
            ))}
          </section>
        ))}
    </div>
  )
}
