import { Avatar, Status, type StatusTone, Tag } from '@unitae/ui'

import { Link } from 'react-router'

import type { MeetingForViewer } from '~/features/dashboard/server/next-meeting-for-viewer.server'
import { DashboardSection, PanelEmpty, panelRowClass } from '~/features/dashboard/ui/DashboardSection'
import { formatMeetingWhen } from '~/features/dashboard/ui/dashboard-format'
import { groupProgrammeParts, sectionColor, sectionDurationMin } from '~/features/events'
import * as m from '~/i18n/paraglide/messages'
import { externalSpeakerLabel } from '~/shared/utils/external-speaker-label'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { cn } from '~/shared/utils/utils'

type MeetingPart = MeetingForViewer['meeting']['eventParts'][number]

/**
 * The next released meeting at a glance: its parts by section, who holds each one, and the two
 * states that need someone to act (an empty slot, an assignee who is away). The viewer's own
 * parts are tinted. Read-only for everyone; absence conflicts arrive only for, and the assign link
 * shows only to, those who may fill this meeting (decided on the server). Clock times are not
 * computed: songs and prayers are not parts, so summed durations would drift.
 */
export function NextMeetingCard({ view, timeZone }: { view: MeetingForViewer; timeZone: string }) {
  const { meeting, canAct, link } = view
  const sections = groupProgrammeParts(meeting.eventParts)

  return (
    <DashboardSection
      title={meeting.name}
      meta={formatMeetingWhen(meeting.startDate, timeZone)}
      link={{ to: link, label: m.dashboard_assignments_link() }}
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
                      <PartRow key={part.id} part={part} assignTo={canAct ? link : null} />
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

// `assignTo`: the editor, for those who may fill the slot; nobody else gets a way to act.
function PartRow({ part, assignTo }: { part: MeetingPart; assignTo: string | null }) {
  const status = partStatus(part)
  const isOpen = part.assignee == null && part.externalSpeaker == null
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
            <Avatar name={formatPersonName(part.assignee, '')} />
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
            <span className="truncate">{externalSpeakerLabel(part.externalSpeaker)}</span>
            <Tag className="shrink-0">{m.programs_view_external_badge()}</Tag>
          </>
        ) : (
          <span className="text-faint">—</span>
        )}
      </span>
      <span className="flex shrink-0 items-center justify-end gap-2 sm:w-40 sm:justify-start">
        {status && <Status tone={status.tone}>{status.label}</Status>}
        {isOpen && assignTo != null && (
          <Link to={assignTo} className="font-medium text-brand-text text-xs underline-offset-4 hover:underline">
            {m.dashboard_meeting_assign()}
          </Link>
        )}
      </span>
    </li>
  )
}
