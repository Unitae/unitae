import { useState } from 'react'
import type { useFetcher } from 'react-router'
import { PersonFacts } from '~/features/events/ui/PersonFacts'
import { useCandidateFacts } from '~/features/events/ui/use-candidate-facts'
import * as m from '~/i18n/paraglide/messages'
import { Label } from '~/shared/ui/label'
import { PersonDropdown } from '~/shared/ui/PersonDropdown'
import { cn } from '~/shared/utils/utils'
import type { PersonOption } from './AssignPartEditor'

export type AssignableService = { id: number; name: string; assigneeId: number | null }

export interface AssignServiceEditorProps {
  service: AssignableService
  candidates: PersonOption[]
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

/** The id of the service assignment form, for a submit button placed outside it. */
export const ASSIGN_SERVICE_FORM_ID = 'assign-service-form'

/** Who does a service (sound, attendants…) at this event. Remount it (a `key`) to start again. */
export function AssignServiceEditor({
  service,
  candidates,
  eventId,
  fetcher,
  timeZone,
  referenceYear,
  formRef,
  className,
}: AssignServiceEditorProps) {
  const [assignee, setAssignee] = useState(service.assigneeId?.toString() ?? '')
  const { describeMember } = useCandidateFacts({
    eventId,
    timeZone,
    referenceYear,
    slot: { kind: 'service', assignmentId: service.id },
  })

  return (
    <fetcher.Form
      id={ASSIGN_SERVICE_FORM_ID}
      ref={formRef}
      method="post"
      action={`/programs/events/${eventId}/assign-service`}
      className={cn('flex flex-col gap-2.5', className)}
    >
      <input type="hidden" name="assignmentId" value={service.id} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="serviceAssigneeId">{m.programs_assign_service_publisher_label()}</Label>
        <PersonDropdown
          id="serviceAssigneeId"
          name="assigneeId"
          people={candidates}
          value={assignee}
          onValueChange={setAssignee}
          placeholder={m.programs_assign_service_select_publisher()}
          noneLabel={m.programs_assign_service_none()}
          describePerson={describeMember}
        />
      </div>
      <PersonFacts
        eventId={eventId}
        userId={assignee || null}
        excludeServiceAssignmentId={service.id}
        timeZone={timeZone}
        referenceYear={referenceYear}
      />
    </fetcher.Form>
  )
}
