import { AlertTriangle, Clock } from 'lucide-react'
import { Link } from 'react-router'

import type { ProgrammePartLike, ProgrammeSectionGroup } from '~/features/events/model/programme-grouping'
import { sectionDurationMin } from '~/features/events/model/programme-grouping'
import { SectionHeading, TrackHeading } from '~/features/events/ui/ProgrammeHeadings'
import { ShareAssignmentButton } from '~/features/events/ui/ShareAssignmentButton'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'
import { cn } from '~/shared/utils/utils'

export interface MobilePartEntry extends ProgrammePartLike {
  id: number
  name: string
  topic: string
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
  /**
   * Finished share message per assignment id — absent when there is nothing to
   * send. Rendered as a trailing action on the row, exactly like the desktop
   * table's actions column: sharing is a one-tap, saved-state action, never
   * hidden behind the edit sheet where it would share a stale draft.
   */
  shareTexts?: Record<number, string>
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
  shareTexts,
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
                  shareText={shareTexts?.[part.id]}
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
  shareText,
}: {
  part: T
  canEdit: boolean
  canViewPublishers: boolean
  onClick: () => void
  shareText?: string
}) {
  // Content on the left, metadata on the right — the duration is vertically
  // centred so it lines up with the share action beside it, instead of the two
  // sitting at different heights on the row's right edge.
  const body = (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium text-sm">{part.name}</span>
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
      </div>
      {part.durationMin != null && (
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs tabular-nums">
          <Clock className="size-3" aria-hidden="true" />
          {part.durationMin} min
        </span>
      )}
    </div>
  )

  const rowClass = 'w-full px-2 py-2.5 text-left'

  if (canEdit) {
    // Two sibling targets, not one: the row cannot be a single <button> once it
    // carries a share action (nested buttons are invalid), and the visible gap
    // keeps a thumb aimed at one from landing on the other.
    return (
      <div className="flex items-center border-border/40 border-b">
        <button
          type="button"
          onClick={onClick}
          className={cn(rowClass, 'min-w-0 flex-1 transition-colors active:bg-muted/50')}
        >
          {body}
        </button>
        {shareText && (
          <div className="pr-1 pl-2">
            <ShareAssignmentButton
              text={shareText}
              label={m.programs_share_button_label({
                name: part.externalSpeaker?.name ?? (part.assignee ? personName(part.assignee) : ''),
              })}
              className="size-10 [&_svg]:size-4"
            />
          </div>
        )}
      </div>
    )
  }
  return <div className={cn(rowClass, 'border-border/40 border-b')}>{body}</div>
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
