import { Panel } from '@unitae/ui'
import { Clock, UserPlus, X } from 'lucide-react'
import { Fragment } from 'react'
import { resolvePartCapability } from '~/features/events/model/part-capability'
import { partReaderLabel, partSpeakerLabel } from '~/features/events/model/part-labels'
import { groupProgrammeParts, summarizeDurations } from '~/features/events/model/programme-grouping'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { type ExternalSpeakerLabelSource, externalSpeakerLabel } from '~/shared/utils/external-speaker-label'
import { cn } from '~/shared/utils/utils'
import type { AssignablePart } from './AssignPartEditor'
import { PersonCell, type PersonName, personName } from './PersonCell'
import { durationLabel, ProgrammeSectionHead, ProgrammeTrackHead, ROW_REVEAL } from './ProgrammeRows'
import { ShareAssignmentButton } from './ShareAssignmentButton'

export interface AssignedPart extends AssignablePart {
  /** Orders the rooms inside a section. */
  trackOrder: number | null
  assignee: PersonName | null
  assistant: PersonName | null
  externalSpeaker: (ExternalSpeakerLabelSource & { archivedAt?: Date | string | null }) | null
  hasConflict: boolean
}

export interface UnassignTarget {
  type: 'part' | 'service'
  id: number
  name: string
  assigneeName: string
}

interface EventAssignmentsPanelProps {
  parts: AssignedPart[]
  /** The viewer may assign parts: empty slots and row actions open the assignment. */
  canAssign: boolean
  canViewPublishers: boolean
  /** Finished message per part, when there is someone to send it to. */
  shareTexts: Record<number, string>
  /** The part open in the assignment editor, highlighted. */
  selectedId: number | null
  onAssign: (part: AssignedPart, trigger: HTMLElement) => void
  onUnassign: (target: UnassignTarget) => void
}

/**
 * The programme as a table of who does what: the parts in their sections and rooms, and the people in each slot. On
 * a phone each row becomes a small grid: the part, its duration and actions, then the people under it with their
 * slot's label.
 */
export function EventAssignmentsPanel({
  parts,
  canAssign,
  canViewPublishers,
  shareTexts,
  selectedId,
  onAssign,
  onUnassign,
}: EventAssignmentsPanelProps) {
  const sections = groupProgrammeParts(parts)

  return (
    <Panel
      title={m.programs_view_spiritual_program()}
      footer={
        parts.length > 0 && (
          <>
            <span>
              {parts.length === 1
                ? m.programs_edit_parts_one()
                : m.programs_edit_parts_many({ count: String(parts.length) })}
            </span>
            <span className="tabular-nums">{durationLabel(summarizeDurations(parts), true)}</span>
          </>
        )
      }
    >
      {parts.length === 0 ? (
        <p className="px-4.5 py-6 text-muted-foreground text-sm">{m.dashboard_meeting_no_parts()}</p>
      ) : (
        <table className="w-full table-fixed border-collapse text-sm max-md:block">
          <caption className="sr-only">{m.programs_view_spiritual_program()}</caption>
          <thead className="max-md:sr-only">
            <tr className="h-8.5 border-border border-b text-left text-faint">
              <th scope="col" className="pl-4.5 font-medium">
                {m.programs_view_part_col()}
              </th>
              <th scope="col" className="w-[5.5rem] px-1.5 text-right font-medium">
                {m.programs_view_duration_col()}
              </th>
              <th scope="col" className="w-[27%] px-3 font-medium">
                {m.programs_view_speaker_col()}
              </th>
              <th scope="col" className="w-[27%] px-3 font-medium">
                {m.programs_view_reader_col()}
              </th>
              <th scope="col" className="w-[5.5rem] pr-4.5">
                <span className="sr-only">{m.common_actions()}</span>
              </th>
            </tr>
          </thead>
          <tbody className="max-md:block">
            {sections.map((section, index) => (
              <Fragment key={`section-${section.section || index}`}>
                {section.section && (
                  <tr className="max-md:block">
                    <td colSpan={5} className="p-0 max-md:block">
                      <ProgrammeSectionHead
                        section={section.section}
                        parts={section.tracks.flatMap(track => track.parts)}
                      />
                    </td>
                  </tr>
                )}
                {section.tracks.map(track => (
                  <Fragment key={`track-${track.parts[0]?.id ?? track.track}`}>
                    {track.track !== '' && (
                      <tr className="max-md:block">
                        <td colSpan={5} className="p-0 max-md:block">
                          <ProgrammeTrackHead track={track.track} count={track.parts.length} className="pl-4.5" />
                        </td>
                      </tr>
                    )}
                    {track.parts.map(part => (
                      <PartRow
                        key={part.id}
                        part={part}
                        indented={track.track !== ''}
                        selected={part.id === selectedId}
                        canAssign={canAssign}
                        canViewPublishers={canViewPublishers}
                        shareText={shareTexts[part.id]}
                        onAssign={trigger => onAssign(part, trigger)}
                        onUnassign={onUnassign}
                      />
                    ))}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}

interface PartRowProps {
  part: AssignedPart
  indented: boolean
  selected: boolean
  canAssign: boolean
  canViewPublishers: boolean
  shareText: string | undefined
  onAssign: (trigger: HTMLElement) => void
  onUnassign: (target: UnassignTarget) => void
}

function PartRow({
  part,
  indented,
  selected,
  canAssign,
  canViewPublishers,
  shareText,
  onAssign,
  onUnassign,
}: PartRowProps) {
  const capability = resolvePartCapability(part, part.preset)
  const assigned = part.externalSpeaker
    ? externalSpeakerLabel(part.externalSpeaker)
    : part.assignee
      ? personName(part.assignee)
      : null
  // Only a kind that names a second person makes it a slot to fill: a kind done by one person has none, and a part
  // without a kind merely allows one. Both leave the cell empty rather than show a gap. Someone already in it stays.
  const secondExpected = part.preset?.hasReaderSlot === true || part.assistantId != null
  const assign = canAssign ? onAssign : undefined

  return (
    <tr
      data-selected={selected || undefined}
      className={cn(
        'group/row border-border border-b transition-colors last:border-b-0 hover:bg-hover',
        'max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-1.5 max-md:px-4.5 max-md:py-2.5',
        indented && 'max-md:pl-10',
        selected && 'bg-selected hover:bg-selected',
      )}
    >
      <td
        className={cn(
          'h-11 min-w-0 py-1.5 md:pl-4.5',
          indented && 'md:pl-10',
          'max-md:order-1 max-md:h-auto max-md:p-0',
        )}
      >
        <div className="md:truncate">{part.name}</div>
        {part.topic && <div className="truncate text-faint text-xs">{part.topic}</div>}
      </td>
      <td className="whitespace-nowrap px-1.5 text-right text-muted-foreground tabular-nums max-md:order-2 max-md:p-0">
        {part.durationMin != null ? (
          <span className="inline-flex items-center gap-1.5">
            <Clock aria-hidden="true" className="size-3.5 text-faint" />
            {m.programme_section_total_min({ minutes: String(part.durationMin) })}
          </span>
        ) : (
          <>
            <span aria-hidden="true" className="text-faint">
              —
            </span>
            <span className="sr-only">{m.programs_edit_no_duration()}</span>
          </>
        )}
      </td>
      <td className="px-3 max-md:order-4 max-md:col-span-3 max-md:flex max-md:items-center max-md:gap-3 max-md:p-0">
        <span className="w-24 flex-none text-faint text-xs md:hidden">{partSpeakerLabel(capability)}</span>
        <PersonCell
          person={part.assignee}
          personId={part.assigneeId}
          external={part.externalSpeaker}
          conflict={part.hasConflict}
          linkToPublisher={canViewPublishers}
          onAssign={assign}
        />
      </td>
      <td
        className={cn(
          'px-3 max-md:order-5 max-md:col-span-3 max-md:flex max-md:items-center max-md:gap-3 max-md:p-0',
          !secondExpected && 'max-md:hidden',
        )}
      >
        {secondExpected && (
          <>
            <span className="w-24 flex-none text-faint text-xs md:hidden">{partReaderLabel(capability)}</span>
            <PersonCell
              person={part.assistant}
              personId={part.assistantId}
              linkToPublisher={canViewPublishers}
              onAssign={assign}
            />
          </>
        )}
      </td>
      <td className="pr-4.5 max-md:order-3 max-md:p-0">
        <div className={cn('flex justify-end gap-0.5', selected ? 'opacity-100' : ROW_REVEAL)}>
          {canAssign && (
            <PartActions
              part={part}
              assigned={assigned}
              shareText={shareText}
              onAssign={onAssign}
              onUnassign={onUnassign}
            />
          )}
        </div>
      </td>
    </tr>
  )
}

function PartActions({
  part,
  assigned,
  shareText,
  onAssign,
  onUnassign,
}: {
  part: AssignedPart
  /** Who is in the main slot, when someone is. */
  assigned: string | null
  shareText: string | undefined
  onAssign: (trigger: HTMLElement) => void
  onUnassign: (target: UnassignTarget) => void
}) {
  return (
    <>
      {shareText && assigned && (
        <ShareAssignmentButton
          text={shareText}
          label={m.programs_share_button_label({ name: assigned })}
          className="size-7"
        />
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-7"
        aria-label={m.programs_view_assign_item({ name: part.name })}
        onClick={event => onAssign(event.currentTarget)}
      >
        <UserPlus className="size-3.5" />
      </Button>
      {assigned && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7 text-muted-foreground hover:text-destructive"
          aria-label={m.programs_view_unassign_item({ name: part.name })}
          onClick={() => onUnassign({ type: 'part', id: part.id, name: part.name, assigneeName: assigned })}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </>
  )
}
