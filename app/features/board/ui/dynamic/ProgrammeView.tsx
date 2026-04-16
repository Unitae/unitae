import { Calendar } from 'lucide-react'
import { groupPartsBySlot } from '~/features/events/model/group-parts-by-slot'
import * as m from '~/paraglide/messages'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'

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
  partAssignments: PartAssignment[]
  serviceRoleAssignments?: ServiceRoleAssignment[]
}

interface ProgrammeViewData {
  events: ProgrammeEvent[]
  showServices: boolean
}

function formatName(
  user: {
    firstname: string | null
    lastname: string | null
    anonymizedAt: Date | null
  } | null,
): string {
  if (!user) return '—'
  if (user.anonymizedAt != null) return m.board_read_status_anonymized_user()
  return [user.firstname, user.lastname].filter(Boolean).join(' ') || '—'
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function PartRow({ part }: { part: PartAssignment }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-muted/40 p-2">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{part.name}</span>
        {part.durationMin != null && <span className="text-muted-foreground text-xs">{part.durationMin} min</span>}
      </div>
      {part.topic && <span className="text-muted-foreground text-xs italic">{part.topic}</span>}
      <div className="flex flex-wrap gap-3 text-xs">
        <span>
          <span className="text-muted-foreground">{m.board_dynamic_programme_assignee()} </span>
          <span className="font-medium">{formatName(part.assignee)}</span>
        </span>
        {part.assistant && (
          <span>
            <span className="text-muted-foreground">{m.board_dynamic_programme_assistant()} </span>
            <span className="font-medium">{formatName(part.assistant)}</span>
          </span>
        )}
      </div>
    </div>
  )
}

export function ProgrammeView({ events, showServices }: ProgrammeViewData) {
  const uniqueNames = new Set(events.map(e => e.name))
  const allSameName = uniqueNames.size === 1

  if (events.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title={m.board_dynamic_programme_empty_title()}
        description={m.board_dynamic_programme_empty_description()}
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      {events.map(event => {
        const sections = groupPartsBySlot(event.partAssignments)
        return (
          <Card key={event.id}>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                {allSameName ? (
                  <h2 className="font-display font-semibold text-lg capitalize">{formatDate(event.startDate)}</h2>
                ) : (
                  <>
                    <h2 className="font-display font-semibold text-lg">{event.name}</h2>
                    <span className="text-muted-foreground text-sm capitalize">{formatDate(event.startDate)}</span>
                  </>
                )}
              </div>
              {sections.map(({ section, slots }) => (
                <div key={`${section}-${slots[0]?.parts[0]?.id ?? 0}`} className="flex flex-col gap-2">
                  {section && (
                    <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">{section}</p>
                  )}
                  <ul className="flex flex-col gap-2 text-sm">
                    {slots.map(slot => (
                      <li key={`slot-${slot.parts[0].id}`}>
                        {slot.parts.length === 1 ? (
                          <PartRow part={slot.parts[0]} />
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {slot.parts.map(part => (
                              <div key={part.id} className="flex flex-col gap-1">
                                {part.track && (
                                  <span className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wide">
                                    {part.track}
                                  </span>
                                )}
                                <PartRow part={part} />
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {showServices && event.serviceRoleAssignments && event.serviceRoleAssignments.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                    {m.board_dynamic_programme_services_heading()}
                  </p>
                  <ul className="flex flex-col gap-1 text-sm">
                    {event.serviceRoleAssignments.map(role => (
                      <li
                        key={role.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 p-2"
                      >
                        <span className="font-medium">{role.name}</span>
                        <span className="text-xs">{formatName(role.assignee ?? null)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
