import { useState } from 'react'
import { Link, type useFetcher } from 'react-router'
import { resolvePartCapability } from '~/features/events/model/part-capability'
import { partReaderLabel, partSpeakerLabel } from '~/features/events/model/part-labels'
import { ExternalSpeakerFacts } from '~/features/events/ui/ExternalSpeakerFacts'
import { PersonFacts } from '~/features/events/ui/PersonFacts'
import { useCandidateFacts } from '~/features/events/ui/use-candidate-facts'
import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PersonDropdown } from '~/shared/ui/PersonDropdown'
import { RadioGroup, RadioGroupItem } from '~/shared/ui/radio-group'
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
  /** Speakers from other congregations; an empty congregation means their record is to complete. */
  externalSpeakers: { id: number; name: string; congregationName: string }[]
  eventId: number
  fetcher: ReturnType<typeof useFetcher>
  /** The congregation's time zone, for the dates in the facts. */
  timeZone: string
  /** The event's year: dates in it go without theirs. */
  referenceYear: number
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
  timeZone,
  referenceYear,
  formRef,
  className,
}: AssignPartEditorProps) {
  const capability = resolvePartCapability(part, part.preset)
  // A kind done by one person has no second slot, so offering one invites an assignment nobody can fill. It stays
  // visible when somebody is already in it: hiding it on a part whose kind changed later would strand them there.
  const hasSecondSlot = capability.hasReaderSlot || part.assistantId != null
  const facts = { eventId, timeZone, referenceYear }
  const { describeMember: describeSpeaker, describeSpeaker: describeExternal } = useCandidateFacts({
    ...facts,
    slot: { kind: 'part', assignmentId: part.id, partSlot: 'assignee' },
    speakers: externalSpeakers,
  })
  const { describeMember: describeReader } = useCandidateFacts({
    ...facts,
    slot: { kind: 'part', assignmentId: part.id, partSlot: 'assistant' },
    enabled: hasSecondSlot,
  })
  const [assignee, setAssignee] = useState(part.assigneeId?.toString() ?? '')
  const [assistant, setAssistant] = useState(part.assistantId?.toString() ?? '')
  const [externalSpeaker, setExternalSpeaker] = useState(part.externalSpeakerId?.toString() ?? '')
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
      className={cn('flex flex-col gap-[18px]', className)}
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
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="externalSpeakerId">{m.programs_assign_part_speaker_label()}</Label>
            <PersonDropdown
              id="externalSpeakerId"
              name="externalSpeakerId"
              people={externalSpeakers.map(speaker => ({
                id: speaker.id,
                firstname: null,
                lastname: null,
                name: speaker.name,
              }))}
              value={externalSpeaker}
              onValueChange={setExternalSpeaker}
              disabled={!hasRegistry}
              placeholder={
                hasRegistry
                  ? m.programs_assign_part_external_select_placeholder()
                  : m.programs_assign_part_external_empty()
              }
              noneLabel={m.programs_assign_part_none()}
              describePerson={describeExternal}
            />
            {!hasRegistry && (
              <Link to="/programs/external-speakers/new" className="text-primary text-sm hover:underline">
                {m.programs_assign_part_external_manage_link()}
              </Link>
            )}
          </div>
          <ExternalSpeakerFacts
            eventId={eventId}
            externalSpeakerId={externalSpeaker}
            excludePartAssignmentId={part.id}
            timeZone={timeZone}
            referenceYear={referenceYear}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
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
                describePerson={describeSpeaker}
              />
            </div>
            <PersonFacts
              eventId={eventId}
              userId={assignee}
              excludePartAssignmentId={part.id}
              partSlot="assignee"
              timeZone={timeZone}
              referenceYear={referenceYear}
            />
          </div>

          {hasSecondSlot && (
            <div className="flex flex-col gap-2.5 border-border border-t pt-4">
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
                  describePerson={describeReader}
                />
              </div>
              <PersonFacts
                eventId={eventId}
                userId={assistant}
                excludePartAssignmentId={part.id}
                partSlot="assistant"
                timeZone={timeZone}
                referenceYear={referenceYear}
              />
            </div>
          )}
        </>
      )}
    </fetcher.Form>
  )
}
