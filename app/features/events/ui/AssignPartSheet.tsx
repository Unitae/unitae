import { useEffect, useRef, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { ExternalSpeakerInfoCard } from '~/features/events/ui/ExternalSpeakerInfoCard'
import { PublisherInfoCard } from '~/features/events/ui/PublisherInfoCard'
import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PersonDropdown } from '~/shared/ui/PersonDropdown'
import { RadioGroup, RadioGroupItem } from '~/shared/ui/radio-group'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'

type PartAssignment = {
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
}

type ExternalSpeakerOption = { id: number; name: string }

type PersonOption = { id: number; firstname: string | null; lastname: string | null }

type AssignPartSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  assignment: PartAssignment | null
  speakerCandidates: PersonOption[]
  readerCandidates: PersonOption[]
  externalSpeakers: ExternalSpeakerOption[]
  eventId: number
}

export function AssignPartSheet({
  open,
  onOpenChange,
  assignment,
  speakerCandidates,
  readerCandidates,
  externalSpeakers,
  eventId,
}: AssignPartSheetProps) {
  const fetcher = useFetcher<{ ok: boolean }>()
  const prevState = useRef(fetcher.state)
  const [selectedAssignee, setSelectedAssignee] = useState('')
  const [selectedAssistant, setSelectedAssistant] = useState('')
  const [selectedExternalSpeaker, setSelectedExternalSpeaker] = useState('none')
  const [speakerType, setSpeakerType] = useState<'internal' | 'external'>('internal')

  useEffect(() => {
    if (assignment) {
      setSelectedAssignee(assignment.assigneeId?.toString() ?? '')
      setSelectedAssistant(assignment.assistantId?.toString() ?? '')
      setSelectedExternalSpeaker(assignment.externalSpeakerId?.toString() ?? 'none')
      setSpeakerType(assignment.externalSpeakerId ? 'external' : 'internal')
    }
  }, [assignment])

  useEffect(() => {
    if (prevState.current === 'submitting' && fetcher.state === 'idle' && fetcher.data?.ok) {
      onOpenChange(false)
    }
    prevState.current = fetcher.state
  }, [fetcher.state, fetcher.data, onOpenChange])

  const hasRegistry = externalSpeakers.length > 0

  if (!assignment) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{assignment.name}</SheetTitle>
          <SheetDescription>{assignment.section}</SheetDescription>
        </SheetHeader>
        <fetcher.Form
          method="post"
          action={`/programs/events/${eventId}/assign-part`}
          className="flex flex-col gap-4 px-4"
        >
          <input type="hidden" name="assignmentId" value={assignment.id} />

          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="flex flex-col gap-2">
              <Label htmlFor="topic">{m.programs_assign_part_topic_label()}</Label>
              <Input id="topic" name="topic" defaultValue={assignment.topic ?? ''} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sheetDurationMin">{m.programs_edit_part_duration_label()}</Label>
              <Input
                id="sheetDurationMin"
                name="durationMin"
                type="number"
                min={0}
                defaultValue={assignment.durationMin ?? ''}
              />
            </div>
          </div>

          {assignment.allowExternalSpeaker && (
            <div className="flex flex-col gap-2">
              <Label>{m.programs_assign_part_speaker_type_label()}</Label>
              <RadioGroup
                name="speakerType"
                value={speakerType}
                onValueChange={v => setSpeakerType(v as 'internal' | 'external')}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="internal" id="sheetSpeakerInternal" />
                  <Label htmlFor="sheetSpeakerInternal">{m.programs_assign_part_speaker_type_internal()}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="external" id="sheetSpeakerExternal" />
                  <Label htmlFor="sheetSpeakerExternal">{m.programs_assign_part_speaker_type_external()}</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {speakerType === 'external' ? (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="externalSpeakerId">{m.programs_assign_part_speaker_label()}</Label>
                <Select
                  name="externalSpeakerId"
                  value={selectedExternalSpeaker}
                  onValueChange={setSelectedExternalSpeaker}
                  disabled={!hasRegistry}
                >
                  <SelectTrigger>
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
                externalSpeakerId={selectedExternalSpeaker}
                partName={assignment.name}
              />
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="assigneeId">{m.programs_assign_part_speaker_label()}</Label>
                <PersonDropdown
                  id="assigneeId"
                  name="assigneeId"
                  people={speakerCandidates}
                  value={selectedAssignee}
                  onValueChange={setSelectedAssignee}
                  placeholder={m.programs_assign_part_select_publisher()}
                  noneLabel={m.programs_assign_part_none()}
                />
              </div>

              <PublisherInfoCard eventId={eventId} userId={selectedAssignee} excludePartAssignmentId={assignment.id} />

              <div className="flex flex-col gap-2">
                <Label htmlFor="assistantId">{m.programs_assign_part_reader_label()}</Label>
                <PersonDropdown
                  id="assistantId"
                  name="assistantId"
                  people={readerCandidates}
                  value={selectedAssistant}
                  onValueChange={setSelectedAssistant}
                  placeholder={m.programs_assign_part_no_reader()}
                  noneLabel={m.programs_assign_part_none()}
                />
              </div>

              <PublisherInfoCard eventId={eventId} userId={selectedAssistant} excludePartAssignmentId={assignment.id} />
            </>
          )}

          <SheetFooter>
            <SubmitButton>{m.common_save()}</SubmitButton>
          </SheetFooter>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  )
}
