import { useState } from 'react'
import { Link, type useFetcher } from 'react-router'
import { resolvePartCapability } from '~/features/events/model/part-capability'
import { partReaderLabel, partSpeakerLabel } from '~/features/events/model/part-labels'
import { ExternalSpeakerInfoCard } from '~/features/events/ui/ExternalSpeakerInfoCard'
import { PublisherInfoCard } from '~/features/events/ui/PublisherInfoCard'
import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PersonDropdown } from '~/shared/ui/PersonDropdown'
import { RadioGroup, RadioGroupItem } from '~/shared/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { cn } from '~/shared/utils/utils'

export type AssignablePart = {
  id: number
  name: string
  section: string
  track: string
  topic: string
  durationMin: number | null
  assigneeId: number | null
  assistantId: number | null
  allowExternalSpeaker: boolean
  externalSpeakerId: number | null
  speakerLabel: string | null
  readerLabel: string | null
  // The kind this part is, when it has one. It decides the slot labels, whether
  // there is a second slot, and whether an external speaker may be assigned —
  // the part's own columns apply only in its absence.
  preset: {
    speakerLabel: string | null
    readerLabel: string | null
    hasReaderSlot: boolean
    allowExternalSpeaker: boolean
  } | null
}

export type PersonOption = { id: number; firstname: string | null; lastname: string | null }

export interface AssignPartEditorProps {
  part: AssignablePart
  speakerCandidates: PersonOption[]
  readerCandidates: PersonOption[]
  externalSpeakers: { id: number; name: string }[]
  eventId: number
  fetcher: ReturnType<typeof useFetcher>
  /** Receives the form element, e.g. to count its changes. */
  formRef?: (form: HTMLFormElement | null) => void
  className?: string
}

/** The id of the assignment form, for a submit button placed outside it. */
export const ASSIGN_PART_FORM_ID = 'assign-part-form'

/** The part's name as the title, and where it sits in the programme. */
export function assignPartCopy(part: Pick<AssignablePart, 'name' | 'section' | 'track'>) {
  return { title: part.name, description: [part.section, part.track].filter(Boolean).join(' · ') || undefined }
}

/**
 * Who does a part, and what it is about this week: the subject and the duration, the speaker (a publisher, or an
 * external speaker when the kind allows one) and the second speaker. Remount it (a `key`) to start again.
 */
export function AssignPartEditor({
  part,
  speakerCandidates,
  readerCandidates,
  externalSpeakers,
  eventId,
  fetcher,
  formRef,
  className,
}: AssignPartEditorProps) {
  const capability = resolvePartCapability(part, part.preset)
  const [assignee, setAssignee] = useState(part.assigneeId?.toString() ?? '')
  const [assistant, setAssistant] = useState(part.assistantId?.toString() ?? '')
  const [externalSpeaker, setExternalSpeaker] = useState(part.externalSpeakerId?.toString() ?? 'none')
  const [speakerType, setSpeakerType] = useState<'internal' | 'external'>(
    part.externalSpeakerId ? 'external' : 'internal',
  )
  const hasRegistry = externalSpeakers.length > 0

  return (
    <fetcher.Form
      id={ASSIGN_PART_FORM_ID}
      ref={formRef}
      method="post"
      action={`/programs/events/${eventId}/assign-part`}
      className={cn('flex flex-col gap-4', className)}
    >
      <input type="hidden" name="assignmentId" value={part.id} />

      <div className="grid grid-cols-[1fr_6.5rem] gap-2.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="topic">{m.programs_assign_part_topic_label()}</Label>
          <Input id="topic" name="topic" defaultValue={part.topic ?? ''} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="assignDurationMin">{m.programs_edit_part_duration_label()}</Label>
          <Input
            id="assignDurationMin"
            name="durationMin"
            type="number"
            min={0}
            defaultValue={part.durationMin ?? ''}
          />
        </div>
      </div>

      {capability.allowExternalSpeaker && (
        <div className="flex flex-col gap-1.5">
          <Label>{m.programs_assign_part_speaker_type_label()}</Label>
          <RadioGroup
            name="speakerType"
            value={speakerType}
            onValueChange={value => setSpeakerType(value as 'internal' | 'external')}
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="internal" id="speakerInternal" />
              <Label htmlFor="speakerInternal" className="font-normal">
                {m.programs_assign_part_speaker_type_internal()}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="external" id="speakerExternal" />
              <Label htmlFor="speakerExternal" className="font-normal">
                {m.programs_assign_part_speaker_type_external()}
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}

      {speakerType === 'external' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="externalSpeakerId">{m.programs_assign_part_speaker_label()}</Label>
            <Select
              name="externalSpeakerId"
              value={externalSpeaker}
              onValueChange={setExternalSpeaker}
              disabled={!hasRegistry}
            >
              <SelectTrigger id="externalSpeakerId" className="w-full">
                <SelectValue
                  placeholder={
                    hasRegistry
                      ? m.programs_assign_part_external_select_placeholder()
                      : m.programs_assign_part_external_empty()
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{m.programs_assign_part_none()}</SelectItem>
                {externalSpeakers.map(speaker => (
                  <SelectItem key={speaker.id} value={speaker.id.toString()}>
                    {speaker.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!hasRegistry && (
              <Link to="/programs/external-speakers/new" className="text-primary text-sm hover:underline">
                {m.programs_assign_part_external_manage_link()}
              </Link>
            )}
          </div>
          <ExternalSpeakerInfoCard
            eventId={eventId}
            externalSpeakerId={externalSpeaker}
            excludePartAssignmentId={part.id}
          />
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assigneeId">{partSpeakerLabel(capability)}</Label>
            <PersonDropdown
              id="assigneeId"
              name="assigneeId"
              people={speakerCandidates}
              value={assignee}
              onValueChange={setAssignee}
              placeholder={m.programs_assign_part_select_publisher()}
              noneLabel={m.programs_assign_part_none()}
            />
          </div>
          <PublisherInfoCard
            eventId={eventId}
            userId={assignee}
            excludePartAssignmentId={part.id}
            partSlot="assignee"
          />

          {/* A kind done by one person has no second slot, so offering one invites an assignment nobody can fill.
              It stays visible when somebody is already in it: hiding the control on a part whose kind changed later
              would strand them there with no way to take them out. */}
          {(capability.hasReaderSlot || part.assistantId != null) && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="assistantId">{partReaderLabel(capability)}</Label>
                <PersonDropdown
                  id="assistantId"
                  name="assistantId"
                  people={readerCandidates}
                  value={assistant}
                  onValueChange={setAssistant}
                  placeholder={m.programs_assign_part_no_reader()}
                  noneLabel={m.programs_assign_part_none()}
                />
              </div>
              <PublisherInfoCard
                eventId={eventId}
                userId={assistant}
                excludePartAssignmentId={part.id}
                partSlot="assistant"
              />
            </>
          )}
        </>
      )}
    </fetcher.Form>
  )
}
