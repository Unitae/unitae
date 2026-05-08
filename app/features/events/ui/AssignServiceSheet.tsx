import { useEffect, useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import { PublisherInfoCard } from '~/features/events/ui/PublisherInfoCard'
import * as m from '~/i18n/paraglide/messages'
import { Label } from '~/shared/ui/label'
import { PersonDropdown } from '~/shared/ui/PersonDropdown'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'

type ServiceAssignment = {
  id: number
  name: string
  assigneeId: number | null
}

type AssignServiceSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  assignment: ServiceAssignment | null
  assigneeCandidates: Array<{ id: number; firstname: string | null; lastname: string | null }>
  eventId: number
}

export function AssignServiceSheet({
  open,
  onOpenChange,
  assignment,
  assigneeCandidates,
  eventId,
}: AssignServiceSheetProps) {
  const fetcher = useFetcher<{ ok: boolean }>()
  const prevState = useRef(fetcher.state)
  const [selectedAssignee, setSelectedAssignee] = useState('')

  useEffect(() => {
    if (assignment) {
      setSelectedAssignee(assignment.assigneeId?.toString() ?? '')
    }
  }, [assignment])

  useEffect(() => {
    if (prevState.current === 'submitting' && fetcher.state === 'idle' && fetcher.data?.ok) {
      onOpenChange(false)
    }
    prevState.current = fetcher.state
  }, [fetcher.state, fetcher.data, onOpenChange])

  if (!assignment) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{assignment.name}</SheetTitle>
        </SheetHeader>
        <fetcher.Form
          method="post"
          action={`/programs/events/${eventId}/assign-service`}
          className="flex flex-col gap-4 px-4"
        >
          <input type="hidden" name="assignmentId" value={assignment.id} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="assigneeId">{m.programs_assign_service_publisher_label()}</Label>
            <PersonDropdown
              id="assigneeId"
              name="assigneeId"
              people={assigneeCandidates}
              value={selectedAssignee}
              onValueChange={setSelectedAssignee}
              placeholder={m.programs_assign_service_select_publisher()}
              noneLabel={m.programs_assign_service_none()}
            />
          </div>

          <PublisherInfoCard eventId={eventId} userId={selectedAssignee || null} partName={assignment.name} />

          <SheetFooter>
            <SubmitButton>{m.common_save()}</SubmitButton>
          </SheetFooter>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  )
}
