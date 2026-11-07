import { Status, type StatusTone, Tag } from '@unitae/ui'

import type { getNextMeeting } from '~/features/dashboard/server/dashboard.server'
import { DashboardSection, PanelEmpty, panelRowClass } from '~/features/dashboard/ui/DashboardSection'
import { formatMeetingWhen } from '~/features/dashboard/ui/dashboard-format'
import { groupProgrammeParts, sectionColor, sectionDurationMin } from '~/features/events'
import * as m from '~/i18n/paraglide/messages'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { cn } from '~/shared/utils/utils'

type NextMeeting = NonNullable<Awaited<ReturnType<typeof getNextMeeting>>>
type MeetingPart = NextMeeting['eventParts'][number]
type Person = NonNullable<MeetingPart['assignee']>

/**
 * The next released meeting at a glance: its parts by section, who holds each one, and the two
 * states that need someone to act (an empty slot, an assignee who is away). The viewer's own
 * parts are tinted. Clock times are not
 * computed: songs and prayers are not parts, so summed durations would drift.
 */
export function NextMeetingCard({ meeting, timeZone }: { meeting: NextMeeting; timeZone: string }) {
  const sections = groupProgrammeParts(meeting.eventParts)

  return (
    <DashboardSection
      title={meeting.name}
      meta={formatMeetingWhen(meeting.startDate, timeZone)}
      link={{ to: meeting.link, label: m.dashboard_assignments_link() }}
    >
      {meeting.eventParts.length === 0 ? (
        <PanelEmpty title={m.dashboard_meeting_no_parts()} />
      ) : (
        sections.map((group, index) => {
          const minutes = sectionDurationMin(group)
          return (
            // A section name can come back later in a programme; its first part's id cannot.
            <div key={group.tracks[0]?.parts[0]?.id} className={cn(index > 0 && 'border-border border-t')}>
              {group.section !== '' && (
                <div className="flex h-9 items-center gap-2 border-border border-b bg-subtle px-3.5 font-semibold text-[13px]">
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-[3px] shrink-0 rounded-full"
                    style={{ background: sectionColor(group.section) }}
                  />
                  <span className="min-w-0 flex-1 truncate">{group.section}</span>
                  {minutes != null && (
                    <span className="font-normal text-faint tabular-nums">
                      {m.dashboard_meeting_minutes({ count: String(minutes) })}
                    </span>
                  )}
                </div>
              )}
              {group.tracks.map(track => (
                <div key={track.track}>
                  {track.track !== '' && (
                    <div className="px-3.5 pt-2.5 pb-1 font-medium text-faint text-xs">{track.track}</div>
                  )}
                  <ul>
                    {track.parts.map(part => (
                      <PartRow key={part.id} part={part} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )
        })
      )}
    </DashboardSection>
  )
}

function partStatus(part: MeetingPart): { tone: StatusTone; label: string } | null {
  if (part.assignee == null && part.externalSpeaker == null)
    return { tone: 'neutral', label: m.dashboard_meeting_part_open() }
  if (part.hasConflict) return { tone: 'danger', label: m.dashboard_meeting_part_conflict() }
  return null
}

function PartRow({ part }: { part: MeetingPart }) {
  const status = partStatus(part)
  const isViewer = part.viewerRole != null

  return (
    <li className={cn(panelRowClass, 'flex-wrap gap-y-1 py-2 sm:flex-nowrap sm:py-1.5', isViewer && 'bg-brand-soft')}>
      <span className="min-w-0 flex-1 basis-full truncate text-sm sm:basis-auto">
        {part.name}
        {part.durationMin != null && (
          <span className="text-faint"> · {m.dashboard_meeting_minutes({ count: String(part.durationMin) })}</span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm sm:w-56 sm:flex-none">
        {part.assignee != null ? (
          <>
            <Initials person={part.assignee} />
            <span className="flex min-w-0 flex-col">
              <span className={cn('truncate', part.viewerRole === 'speaker' && 'font-medium')}>
                {formatPersonName(part.assignee)}
              </span>
              {part.assistant != null && (
                <span className={cn('truncate text-faint text-xs', part.viewerRole === 'reader' && 'font-medium')}>
                  {formatPersonName(part.assistant)}
                </span>
              )}
            </span>
          </>
        ) : part.externalSpeaker != null ? (
          <>
            <span className="truncate">{part.externalSpeaker.name}</span>
            <Tag className="shrink-0">{m.programs_view_external_badge()}</Tag>
          </>
        ) : (
          <span className="text-faint">—</span>
        )}
      </span>
      <span className="flex shrink-0 justify-end sm:w-36 sm:justify-start">
        {status && <Status tone={status.tone}>{status.label}</Status>}
      </span>
    </li>
  )
}

function Initials({ person }: { person: Person }) {
  const initials = `${person.firstname?.charAt(0) ?? ''}${person.lastname?.charAt(0) ?? ''}`.toLocaleUpperCase()
  return (
    <span
      aria-hidden="true"
      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-[9.5px] text-muted-foreground tracking-wide"
    >
      {initials}
    </span>
  )
}
