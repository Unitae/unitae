import { AlertTriangle, Clock } from 'lucide-react'
import { Link } from 'react-router'

import type { ProgrammeSectionGroup } from '~/features/events/model/programme-grouping'
import { sectionDurationMin } from '~/features/events/model/programme-grouping'
import { SectionHeading, TrackHeading } from '~/features/events/ui/ProgrammeHeadings'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'
import { cn } from '~/shared/utils/utils'

export interface MobilePartEntry {
  id: number
  name: string
  topic: string
  section: string
  track: string
  trackOrder: number | null
  durationMin: number | null
  assigneeId: number | null
  assignee: { firstname: string | null; lastname: string | null } | null
  assistant: { firstname: string | null; lastname: string | null } | null
  externalSpeaker: { name: string } | null
  hasConflict: boolean
}

interface MobilePartsListProps<T extends MobilePartEntry> {
  groups: ProgrammeSectionGroup<T>[]
  canEdit: boolean
  canViewPublishers: boolean
  onPartClick: (part: T) => void
}

function personName(person: { firstname: string | null; lastname: string | null }): string {
  return `${person.firstname ?? ''} ${person.lastname ?? ''}`.trim()
}

/**
 * Phone rendering of the programme's parts (the desktop table needs ~700px
 * and would only reach assignees through undiscoverable horizontal
 * scrolling). Each part stacks name, duration and the assigned people;
 * editors tap a part to open the assignment sheet.
 */
export function MobilePartsList<T extends MobilePartEntry>({
  groups,
  canEdit,
  canViewPublishers,
  onPartClick,
}: MobilePartsListProps<T>) {
  return (
    <div className="flex flex-col md:hidden">
      {groups.map(group => (
        <div key={group.tracks[0]?.parts[0]?.id ?? group.section} className="flex flex-col">
          {group.section && (
            <div className="bg-muted/50 px-2 py-1.5">
              <SectionHeading section={group.section} durationMin={sectionDurationMin(group)} />
            </div>
          )}
          {group.tracks.map(trackGroup => (
            <div key={trackGroup.parts[0]?.id ?? trackGroup.track} className="flex flex-col">
              {trackGroup.track && (
                <div className="bg-muted/30 px-2 py-1">
                  <TrackHeading track={trackGroup.track} count={trackGroup.parts.length} />
                </div>
              )}
              {trackGroup.parts.map(part => (
                <MobilePartRow
                  key={part.id}
                  part={part}
                  canEdit={canEdit}
                  canViewPublishers={canViewPublishers}
                  onClick={() => onPartClick(part)}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function MobilePartRow<T extends MobilePartEntry>({
  part,
  canEdit,
  canViewPublishers,
  onClick,
}: {
  part: T
  canEdit: boolean
  canViewPublishers: boolean
  onClick: () => void
}) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 flex-1 font-medium text-sm">{part.name}</span>
        {part.durationMin != null && (
          <span className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs tabular-nums">
            <Clock className="size-3" aria-hidden="true" />
            {part.durationMin} min
          </span>
        )}
      </div>
      {part.topic && <div className="text-muted-foreground text-xs">{part.topic}</div>}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
        <PartPerson part={part} canViewPublishers={canViewPublishers} interactiveRow={canEdit} />
        {part.hasConflict && (
          <Badge variant="destructive" className="gap-1 text-xs">
            <AlertTriangle className="size-3" />
            {m.programs_view_absence_badge()}
          </Badge>
        )}
      </div>
      {part.assistant && (
        <div className="text-muted-foreground text-xs">
          {m.programs_view_reader_col()} : <span className="text-foreground">{personName(part.assistant)}</span>
        </div>
      )}
    </>
  )

  const rowClass = 'flex w-full flex-col gap-0.5 border-border/40 border-b px-2 py-2.5 text-left'

  if (canEdit) {
    return (
      <button type="button" onClick={onClick} className={cn(rowClass, 'transition-colors active:bg-muted/50')}>
        {body}
      </button>
    )
  }
  return <div className={rowClass}>{body}</div>
}

function PartPerson({
  part,
  canViewPublishers,
  interactiveRow,
}: {
  part: MobilePartEntry
  canViewPublishers: boolean
  interactiveRow: boolean
}) {
  if (part.externalSpeaker) {
    return (
      <span className="flex items-center gap-2">
        {part.externalSpeaker.name}
        <Badge variant="secondary" className="text-xs">
          {m.programs_view_external_badge()}
        </Badge>
      </span>
    )
  }
  if (!part.assignee) {
    return <span className="text-muted-foreground italic">{m.programs_view_unassigned()}</span>
  }
  if (canViewPublishers && part.assigneeId != null && !interactiveRow) {
    return (
      <Link to={`/publishers/${part.assigneeId}/view`} className="text-primary hover:underline">
        {personName(part.assignee)}
      </Link>
    )
  }
  return <span>{personName(part.assignee)}</span>
}
