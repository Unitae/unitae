import type { LucideIcon } from 'lucide-react'
import { BookOpen, Calendar, ChevronRight, Gem, HeartHandshake } from 'lucide-react'
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import type { ProgrammeDynamicConfig } from '~/features/display-board/model/dynamic-document.type'
import {
  formatName,
  getPartDisplay,
  nameMatches,
  partMatchesQuery,
} from '~/features/display-board/model/programme-display'
import { groupPartsBySlot } from '~/features/events'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'
import { EmptyState } from '~/shared/ui/EmptyState'
import { usePersistedState } from '~/shared/ui/hooks/use-persisted-state'
import { cn } from '~/shared/utils/utils'

// ---------------------------------------------------------------------------
// Section color mapping — uses CSS custom properties from tailwind.css
// ---------------------------------------------------------------------------

const SECTION_COLOR_MAP: [string, string][] = [
  ['joyaux', 'var(--color-section-treasures)'],
  ['minist', 'var(--color-section-ministry)'],
  ['chr', 'var(--color-section-living)'],
]

function sectionColor(section: string): string {
  const lower = section.toLowerCase()
  for (const [pattern, cssVar] of SECTION_COLOR_MAP) {
    if (lower.includes(pattern)) return cssVar
  }
  return 'var(--color-muted-foreground)'
}

const SECTION_ICONS: [string, LucideIcon][] = [
  ['joyaux', Gem],
  ['minist', BookOpen],
  ['chr', HeartHandshake],
]

function sectionIcon(section: string): LucideIcon | undefined {
  const lower = section.toLowerCase()
  for (const [pattern, icon] of SECTION_ICONS) {
    if (lower.includes(pattern)) return icon
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PartAssignment {
  id: number
  name: string
  section: string
  track: string
  order: number
  topic: string
  durationMin: number | null
  externalSpeaker: { name: string } | null
  assignee: {
    id: number
    firstname: string | null
    lastname: string | null
    anonymizedAt: Date | null
  } | null
  assistant: {
    id: number
    firstname: string | null
    lastname: string | null
    anonymizedAt: Date | null
  } | null
}

interface ServiceRoleAssignment {
  id: number
  name: string
  assignee?: {
    id: number
    firstname: string | null
    lastname: string | null
    anonymizedAt: Date | null
  } | null
}

interface ProgrammeEvent {
  id: number
  name: string
  startDate: Date
  templateId?: number | null
  partAssignments: PartAssignment[]
  serviceRoleAssignments?: ServiceRoleAssignment[]
}

export interface ProgrammeViewData {
  events: ProgrammeEvent[]
  showServices: boolean
  config: ProgrammeDynamicConfig | null
  highlightQuery?: string
  scrollContainerRef?: RefObject<HTMLDivElement | null>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function getWeekKey(date: Date): string {
  const d = new Date(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

function getWeekLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

function getMonth(date: Date): string {
  return new Date(date).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ section, icon: Icon }: { section: string; icon?: LucideIcon }) {
  const color = sectionColor(section)
  return (
    <div className="mb-1 flex items-center gap-2">
      {Icon && <Icon className="size-3.5" style={{ color }} />}
      <span className="font-bold text-xs uppercase tracking-wider" style={{ color }}>
        {section}
      </span>
    </div>
  )
}

function PartRow({ part, highlighted, dimmed }: { part: PartAssignment; highlighted: boolean; dimmed: boolean }) {
  const { text: rightText, isExternal } = getPartDisplay(part)
  const displayName = part.topic !== '' ? part.topic : part.name

  return (
    <li
      className={cn(
        'grid grid-cols-[1fr_auto] items-baseline gap-x-4 py-0.5',
        dimmed && 'opacity-30 transition-opacity',
      )}
    >
      <span className="min-w-0 truncate font-semibold text-foreground text-sm">
        {displayName}
        {part.durationMin != null && (
          <span className="ml-1 font-normal text-muted-foreground text-xs">({part.durationMin} min)</span>
        )}
      </span>
      {rightText ? (
        <span
          className={cn(
            'flex shrink-0 items-center gap-1.5 text-foreground text-sm',
            highlighted && 'rounded-sm bg-amber-100 px-1 dark:bg-amber-900/40',
          )}
        >
          {rightText}
          {isExternal && (
            <Badge variant="secondary" className="text-[10px]">
              {m.programs_view_external_badge()}
            </Badge>
          )}
        </span>
      ) : (
        <span className="shrink-0 text-muted-foreground/40 text-sm italic">&mdash;</span>
      )}
    </li>
  )
}

function MultiTrackPart({ parts, query }: { parts: PartAssignment[]; query: string }) {
  const representative = parts[0]
  const hasQuery = query.length > 0

  const displayName = representative.topic !== '' ? representative.topic : representative.name

  return (
    <div>
      <div className="font-semibold text-foreground text-sm">
        {displayName}
        {representative.durationMin != null && (
          <span className="ml-1 font-normal text-muted-foreground text-xs">({representative.durationMin} min)</span>
        )}
      </div>
      {parts.map((part, idx) => {
        const { text: rightText, isExternal } = getPartDisplay(part)
        const trackName = part.track || `Salle ${idx + 1}`
        const highlighted = hasQuery && partMatchesQuery(part, query)
        const dimmed = hasQuery && !highlighted

        return (
          <li
            key={part.id}
            className={cn(
              'ml-3 grid grid-cols-[1fr_auto] items-baseline gap-x-4 py-0.5',
              dimmed && 'opacity-30 transition-opacity',
            )}
          >
            <span className="shrink-0 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
              {trackName}
            </span>
            {rightText ? (
              <span
                className={cn(
                  'flex shrink-0 items-center gap-1.5 text-foreground text-sm',
                  highlighted && 'rounded-sm bg-amber-100 px-1 dark:bg-amber-900/40',
                )}
              >
                {rightText}
                {isExternal && (
                  <Badge variant="secondary" className="text-[10px]">
                    {m.programs_view_external_badge()}
                  </Badge>
                )}
              </span>
            ) : (
              <span className="shrink-0 text-muted-foreground/40 text-sm italic">&mdash;</span>
            )}
          </li>
        )
      })}
    </div>
  )
}

function ServiceSection({
  services,
  hasParts,
  query,
}: {
  services: ServiceRoleAssignment[]
  hasParts: boolean
  query: string
}) {
  const [collapsed, setCollapsed] = usePersistedState('programme-services-collapsed', false)
  const canCollapse = hasParts
  const hasQuery = query.length > 0

  return (
    <div className={hasParts ? 'mt-3' : ''}>
      {canCollapse ? (
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="mb-1 flex w-full cursor-pointer items-center gap-1.5 text-left"
        >
          <ChevronRight
            className={cn('size-4 text-muted-foreground transition-transform duration-200', !collapsed && 'rotate-90')}
          />
          <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            {m.board_viewer_services_label({ count: String(services.length) })}
          </span>
        </button>
      ) : (
        <p className="mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          {m.board_viewer_services_label({ count: String(services.length) })}
        </p>
      )}

      <div
        className={cn(
          canCollapse && 'grid transition-[grid-template-rows] duration-200 ease-in-out',
          canCollapse && (collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'),
        )}
      >
        <div className={cn(canCollapse && 'overflow-hidden')}>
          <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {services.map(role => {
              const name = formatName(role.assignee ?? null)
              const highlighted = hasQuery && nameMatches(role.assignee ?? null, query)
              const dimmed = hasQuery && !highlighted

              return (
                <div
                  key={role.id}
                  className={cn(
                    'grid grid-cols-[1fr_auto] items-baseline gap-x-4',
                    dimmed && 'opacity-30 transition-opacity',
                  )}
                >
                  <span className="text-muted-foreground text-sm">{role.name}</span>
                  {name ? (
                    <span
                      className={cn(
                        'font-medium text-foreground text-sm',
                        highlighted && 'rounded-sm bg-amber-100 px-1 dark:bg-amber-900/40',
                      )}
                    >
                      {name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40 text-sm italic">&mdash;</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProgrammeView({ events, showServices, config, highlightQuery, scrollContainerRef }: ProgrammeViewData) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title={m.board_dynamic_programme_empty_title()}
        description={m.board_dynamic_programme_empty_description()}
      />
    )
  }

  const query = highlightQuery?.toLowerCase().trim() ?? ''
  const hasQuery = query.length > 0

  // Build per-template config map for filtering
  const configMap = config
    ? new Map(config.templates.map(t => [t.templateId, { parts: t.parts, services: t.services }]))
    : null

  // Order events
  const orderedEvents =
    config?.groupBy === 'template'
      ? [...events].sort((a, b) => {
          const nameA = a.name
          const nameB = b.name
          if (nameA !== nameB) return nameA.localeCompare(nameB)
          return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        })
      : events

  // Compute unique weeks
  // biome-ignore lint/correctness/useHookAtTopLevel: orderedEvents is stable per render (derived from props)
  const weekKeys = useMemo(() => {
    const seen = new Set<string>()
    const keys: string[] = []
    for (const event of orderedEvents) {
      const wk = getWeekKey(new Date(event.startDate))
      if (!seen.has(wk)) {
        seen.add(wk)
        keys.push(wk)
      }
    }
    return keys
  }, [orderedEvents])

  const showWeekNav = weekKeys.length > 1
  // biome-ignore lint/correctness/useHookAtTopLevel: same reason as above
  const weekRefs = useRef(new Map<string, HTMLDivElement | null>())
  // biome-ignore lint/correctness/useHookAtTopLevel: same reason as above
  const [activeWeek, setActiveWeek] = useState<string>(weekKeys[0] ?? '')

  // Track first event id per week for ref attachment
  // biome-ignore lint/correctness/useHookAtTopLevel: hooks are always called — the early return above is only for empty events
  const firstEventIdPerWeek = useMemo(() => {
    const map = new Set<number>()
    const seen = new Set<string>()
    for (const event of orderedEvents) {
      const wk = getWeekKey(new Date(event.startDate))
      if (!seen.has(wk)) {
        seen.add(wk)
        map.add(event.id)
      }
    }
    return map
  }, [orderedEvents])

  // IntersectionObserver to track active week
  // biome-ignore lint/correctness/useHookAtTopLevel: same reason as above
  useEffect(() => {
    const container = scrollContainerRef?.current
    if (!container || !showWeekNav) return

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const weekKey = entry.target.getAttribute('data-week')
            if (weekKey) setActiveWeek(weekKey)
          }
        }
      },
      { root: container, rootMargin: '-10% 0px -80% 0px', threshold: 0 },
    )

    for (const [, el] of weekRefs.current) {
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [scrollContainerRef, showWeekNav])

  // Track month boundaries
  let prevMonth = ''

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      {/* Week navigation strip */}
      {showWeekNav && (
        <div className="sticky top-0 z-20 -mx-4 flex gap-1.5 overflow-x-auto bg-background/95 px-4 py-2 backdrop-blur-sm md:-mx-6 md:px-6">
          {weekKeys.map(wk => (
            <button
              key={wk}
              type="button"
              onClick={() => {
                const el = weekRefs.current.get(wk)
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 font-medium text-xs transition-colors',
                activeWeek === wk
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent',
              )}
            >
              {getWeekLabel(wk)}
            </button>
          ))}
        </div>
      )}

      {/* Events */}
      {orderedEvents.map(event => {
        const templateConfig = event.templateId && configMap ? configMap.get(event.templateId) : null
        const eventShowParts = templateConfig?.parts ?? true
        const eventShowServices = templateConfig?.services ?? showServices

        const sections = groupPartsBySlot(event.partAssignments)
        const isFirstOfWeek = firstEventIdPerWeek.has(event.id)
        const weekKey = getWeekKey(new Date(event.startDate))

        // Month boundary separator
        const currentMonth = getMonth(event.startDate)
        const showMonthSeparator = prevMonth !== '' && currentMonth !== prevMonth
        prevMonth = currentMonth

        return (
          <div key={event.id}>
            {/* Month separator */}
            {showMonthSeparator && (
              <div className="flex items-center gap-3 pb-4">
                <div className="h-px flex-1 bg-border" />
                <span className="font-medium text-muted-foreground text-xs capitalize">{currentMonth}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}

            {/* Event card */}
            <div
              className="rounded-lg border border-border/50 bg-card px-3 pb-3 shadow-sm md:px-4 md:pb-4"
              ref={el => {
                if (isFirstOfWeek) {
                  weekRefs.current.set(weekKey, el)
                  el?.setAttribute('data-week', weekKey)
                }
              }}
              data-week={isFirstOfWeek ? weekKey : undefined}
            >
              {/* Sticky date header */}
              <div
                className={cn(
                  'sticky z-10 -mx-3 mb-2 flex items-center justify-between rounded-t-lg bg-background/95 px-3 py-2 backdrop-blur-sm md:-mx-4 md:px-4',
                  showWeekNav ? 'top-9' : 'top-0',
                )}
              >
                <span className="font-bold text-base text-foreground capitalize">{formatDate(event.startDate)}</span>
                <Badge variant="outline" className="text-xs">
                  {event.name}
                </Badge>
              </div>

              {/* Parts grouped by section */}
              {eventShowParts &&
                sections.map(({ section, slots }) => {
                  const color = sectionColor(section)
                  const icon = sectionIcon(section)

                  return (
                    <ul
                      key={`${section}-${slots[0]?.parts[0]?.id ?? 0}`}
                      className="mt-2 list-none border-l-4 pl-3"
                      style={{ borderColor: color }}
                      aria-label={section || undefined}
                    >
                      {section && <SectionHeader section={section} icon={icon} />}
                      {slots.map(slot => {
                        if (slot.parts.length === 1) {
                          const part = slot.parts[0]
                          const highlighted = hasQuery && partMatchesQuery(part, query)
                          const dimmed = hasQuery && !highlighted

                          return <PartRow key={part.id} part={part} highlighted={highlighted} dimmed={dimmed} />
                        }
                        return <MultiTrackPart key={`slot-${slot.parts[0].id}`} parts={slot.parts} query={query} />
                      })}
                    </ul>
                  )
                })}

              {/* Services */}
              {eventShowServices && event.serviceRoleAssignments && event.serviceRoleAssignments.length > 0 && (
                <ServiceSection services={event.serviceRoleAssignments} hasParts={eventShowParts} query={query} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
