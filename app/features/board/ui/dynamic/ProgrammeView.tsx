import { Calendar } from 'lucide-react'
import * as m from '~/paraglide/messages'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'

interface PartAssignment {
  id: number
  name: string
  section: string
  order: number
  topic: string
  durationMin: number | null
  assignee: { id: number; firstname: string | null; lastname: string | null; anonymizedAt: Date | null } | null
  assistant: { id: number; firstname: string | null; lastname: string | null; anonymizedAt: Date | null } | null
}

interface ServiceRoleAssignment {
  id: number
  name: string
  assignee?: { id: number; firstname: string | null; lastname: string | null; anonymizedAt: Date | null } | null
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
  user: { firstname: string | null; lastname: string | null; anonymizedAt: Date | null } | null,
): string {
  if (!user) return '—'
  if (user.anonymizedAt != null) return m.board_read_status_anonymized_user()
  return [user.firstname, user.lastname].filter(Boolean).join(' ') || '—'
}

/**
 * Groupe les parties en blocs consécutifs partageant la même section, pour
 * préserver l'ordre chronologique du programme même quand une section apparaît
 * plusieurs fois (ex : cantiques au début, au milieu et à la fin).
 */
function groupBySection(parts: PartAssignment[]): Array<{ section: string; parts: PartAssignment[] }> {
  const groups: Array<{ section: string; parts: PartAssignment[] }> = []
  for (const part of parts) {
    const section = part.section || ''
    const last = groups[groups.length - 1]
    if (last && last.section === section) {
      last.parts.push(part)
    } else {
      groups.push({ section, parts: [part] })
    }
  }
  return groups
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function ProgrammeView({ events, showServices }: ProgrammeViewData) {
  const eventsWithAssignments = events.filter(event => event.partAssignments.length > 0)
  const uniqueNames = new Set(eventsWithAssignments.map(e => e.name))
  const allSameName = uniqueNames.size === 1

  if (eventsWithAssignments.length === 0) {
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
      {eventsWithAssignments.map(event => {
        const sections = groupBySection(event.partAssignments)
        return (
          <Card key={event.id}>
            <CardContent className="flex flex-col gap-4 pt-6">
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
              {sections.map(({ section, parts }) => (
                <div key={`${section}-${parts[0]?.id ?? 0}`} className="flex flex-col gap-2">
                  {section && (
                    <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">{section}</p>
                  )}
                  <ul className="flex flex-col gap-2 text-sm">
                    {parts.map(part => (
                      <li key={part.id} className="flex flex-col gap-0.5 rounded-md bg-muted/40 p-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">{part.name}</span>
                          {part.durationMin != null && (
                            <span className="text-muted-foreground text-xs">{part.durationMin} min</span>
                          )}
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
                      <li key={role.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 p-2">
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
