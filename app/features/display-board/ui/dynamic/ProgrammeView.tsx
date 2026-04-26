import { Calendar } from 'lucide-react'
import type { ProgrammeDynamicConfig } from '~/features/display-board/model/dynamic-document.type'
import { groupPartsBySlot } from '~/features/events/model/group-parts-by-slot'
import * as m from '~/paraglide/messages'
import { EmptyState } from '~/shared/ui/EmptyState'

// JW workbook section colors
const SECTION_COLOR_RULES: [string, string][] = [
  ['joyaux', '#5B6770'],
  ['minist', '#C18626'],
  ['chr', '#942926'],
]

function sectionColor(section: string): string | null {
  const lower = section.toLowerCase()
  for (const [pattern, color] of SECTION_COLOR_RULES) {
    if (lower.includes(pattern)) return color
  }
  return null
}

interface PartAssignment {
  id: number
  name: string
  section: string
  track: string
  order: number
  topic: string
  durationMin: number | null
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
}

function formatName(
  user: {
    firstname: string | null
    lastname: string | null
    anonymizedAt: Date | null
  } | null,
): string | null {
  if (!user) return null
  if (user.anonymizedAt != null) return m.board_read_status_anonymized_user()
  const name = [user.firstname, user.lastname].filter(Boolean).join(' ')
  return name || null
}

function formatAssigneeWithAssistant(assignee: string | null, assistant: string | null): string | null {
  if (!assignee) return null
  if (assistant) return `${assignee} / ${assistant}`
  return assignee
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function DotLeader() {
  return <span className="mx-1 mb-0.5 flex-1 self-end border-b border-dotted border-muted-foreground/25" />
}

function SectionHeader({ section }: { section: string }) {
  const color = sectionColor(section) ?? '#64748b'
  return (
    <div className="mt-2 mb-1 flex items-center gap-2">
      <div className="h-3.5 w-1 rounded-sm" style={{ backgroundColor: color }} />
      <span
        className="rounded px-2 py-0.5 font-bold text-white text-xs uppercase tracking-wider"
        style={{ backgroundColor: color }}
      >
        {section}
      </span>
    </div>
  )
}

function PartRow({ part }: { part: PartAssignment }) {
  const assigneeName = formatName(part.assignee)
  const assistantName = formatName(part.assistant)
  const rightText = formatAssigneeWithAssistant(assigneeName, assistantName)
  const displayName = part.topic !== '' ? part.topic : part.name

  return (
    <div className="ml-3 flex items-baseline">
      <span className="shrink-0 font-semibold text-foreground text-sm">
        {displayName}
        {part.durationMin != null && (
          <span className="ml-1 font-normal text-muted-foreground text-xs">({part.durationMin} min)</span>
        )}
      </span>
      <DotLeader />
      {rightText ? (
        <span className="shrink-0 text-foreground text-sm">{rightText}</span>
      ) : (
        <span className="shrink-0 text-muted-foreground/40 text-sm italic">—</span>
      )}
    </div>
  )
}

function MultiTrackPart({ parts }: { parts: PartAssignment[] }) {
  const representative = parts[0]

  return (
    <div className="ml-3">
      <div className="font-semibold text-foreground text-sm">
        {representative.name}
        {representative.durationMin != null && (
          <span className="ml-1 font-normal text-muted-foreground text-xs">({representative.durationMin} min)</span>
        )}
      </div>
      {parts.map((part, idx) => {
        const assigneeName = formatName(part.assignee)
        const assistantName = formatName(part.assistant)
        const rightText = formatAssigneeWithAssistant(assigneeName, assistantName)
        const trackName = part.topic !== '' ? part.topic : part.track || `Salle ${idx + 1}`
        return (
          <div key={part.id} className="ml-3 flex items-baseline">
            <span className="shrink-0 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
              {trackName}
            </span>
            <DotLeader />
            {rightText ? (
              <span className="shrink-0 text-foreground text-sm">{rightText}</span>
            ) : (
              <span className="shrink-0 text-muted-foreground/40 text-sm italic">—</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ServiceSection({ services, hasParts }: { services: ServiceRoleAssignment[]; hasParts: boolean }) {
  return (
    <div className={hasParts ? 'mt-2 ml-3 border-t pt-2' : 'ml-3'}>
      <p className="mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Services</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {services.map(role => {
          const name = formatName(role.assignee ?? null)
          return (
            <div key={role.id} className="flex items-baseline">
              <span className="shrink-0 text-muted-foreground text-sm">{role.name}</span>
              <DotLeader />
              {name ? (
                <span className="shrink-0 font-medium text-foreground text-sm">{name}</span>
              ) : (
                <span className="shrink-0 text-muted-foreground/40 text-sm italic">—</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ProgrammeView({ events, showServices, config }: ProgrammeViewData) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title={m.board_dynamic_programme_empty_title()}
        description={m.board_dynamic_programme_empty_description()}
      />
    )
  }

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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
      {orderedEvents.map(event => {
        const templateConfig = event.templateId && configMap ? configMap.get(event.templateId) : null
        const eventShowParts = templateConfig?.parts ?? true
        const eventShowServices = templateConfig?.services ?? showServices

        const sections = groupPartsBySlot(event.partAssignments)

        return (
          <div key={event.id}>
            {/* Date header */}
            <div className="mb-1 flex items-center justify-between rounded bg-muted/60 px-3 py-1.5">
              <span className="font-bold text-foreground text-sm capitalize">{formatDate(event.startDate)}</span>
              <span className="text-muted-foreground text-xs">{event.name}</span>
            </div>

            {/* Parts */}
            {eventShowParts &&
              sections.map(({ section, slots }) => (
                <div key={`${section}-${slots[0]?.parts[0]?.id ?? 0}`}>
                  {section && <SectionHeader section={section} />}
                  {slots.map(slot => (
                    <div key={`slot-${slot.parts[0].id}`}>
                      {slot.parts.length === 1 ? (
                        <PartRow part={slot.parts[0]} />
                      ) : (
                        <MultiTrackPart parts={slot.parts} />
                      )}
                    </div>
                  ))}
                </div>
              ))}

            {/* Services */}
            {eventShowServices && event.serviceRoleAssignments && event.serviceRoleAssignments.length > 0 && (
              <ServiceSection services={event.serviceRoleAssignments} hasParts={eventShowParts} />
            )}
          </div>
        )
      })}
    </div>
  )
}
