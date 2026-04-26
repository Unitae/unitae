import { useEffect, useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import { PublisherInfoCard } from '~/features/events/ui/PublisherInfoCard'
import * as m from '~/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'

type PartAssignment = {
  id: number
  name: string
  section: string
  track: string
  topic: string
  assigneeId: number | null
  assistantId: number | null
}

type AssignPartSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  assignment: PartAssignment | null
  users: Array<{ id: number; firstname: string | null; lastname: string | null }>
  eventId: number
}

export function AssignPartSheet({ open, onOpenChange, assignment, users, eventId }: AssignPartSheetProps) {
  const fetcher = useFetcher<{ ok: boolean }>()
  const prevState = useRef(fetcher.state)
  const [selectedAssignee, setSelectedAssignee] = useState('none')
  const [selectedAssistant, setSelectedAssistant] = useState('none')

  useEffect(() => {
    if (assignment) {
      setSelectedAssignee(assignment.assigneeId?.toString() ?? 'none')
      setSelectedAssistant(assignment.assistantId?.toString() ?? 'none')
    }
  }, [assignment])

  useEffect(() => {
    if (prevState.current === 'submitting' && fetcher.state === 'idle' && fetcher.data?.ok) {
      onOpenChange(false)
    }
    prevState.current = fetcher.state
  }, [fetcher.state, fetcher.data, onOpenChange])

  const activeSelection =
    selectedAssignee !== 'none' ? selectedAssignee : selectedAssistant !== 'none' ? selectedAssistant : null

  if (!assignment) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="topic">{m.programs_assign_part_topic_label()}</Label>
            <Input id="topic" name="topic" defaultValue={assignment.topic ?? ''} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="assigneeId">{m.programs_assign_part_speaker_label()}</Label>
            <Select name="assigneeId" value={selectedAssignee} onValueChange={setSelectedAssignee}>
              <SelectTrigger>
                <SelectValue placeholder={m.programs_assign_part_select_publisher()} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{m.programs_assign_part_none()}</SelectItem>
                {users.map(user => (
                  <SelectItem key={user.id} value={user.id.toString()}>
                    {user.firstname} {user.lastname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="assistantId">{m.programs_assign_part_reader_label()}</Label>
            <Select name="assistantId" value={selectedAssistant} onValueChange={setSelectedAssistant}>
              <SelectTrigger>
                <SelectValue placeholder={m.programs_assign_part_no_reader()} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{m.programs_assign_part_none()}</SelectItem>
                {users.map(user => (
                  <SelectItem key={user.id} value={user.id.toString()}>
                    {user.firstname} {user.lastname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <PublisherInfoCard eventId={eventId} userId={activeSelection} partName={assignment.name} />

          <SheetFooter>
            <SubmitButton>{m.common_save()}</SubmitButton>
          </SheetFooter>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  )
}
