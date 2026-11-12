import { Panel } from '@unitae/ui'
import { useEffect, useState } from 'react'
import type { useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { DateInput } from '~/shared/ui/DateInput'
import { FormSaveBar } from '~/shared/ui/FormSaveBar'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { formatDateForInput, formatTimeForInput } from '~/shared/utils/event-time'

const FORM_ID = 'event-info-form'

interface EventInfoPanelProps {
  event: { name: string; startDate: Date | string; endDate: Date | string }
  timezone: string
  fetcher: ReturnType<typeof useFetcher>
  /** Whether the fields hold changes not saved yet: the page guards leaving and makes room for the save bar. */
  onDirtyChange: (dirty: boolean) => void
}

/** The event's name, date and times, saved from the save bar once something changed. */
export function EventInfoPanel(props: EventInfoPanelProps) {
  const [version, setVersion] = useState(0)
  const { event } = props
  // A new starting point after « Annuler », and once a save brings the saved values back.
  const key = `${version}|${event.name}|${String(event.startDate)}|${String(event.endDate)}`
  return <EventInfoForm key={key} {...props} onCancel={() => setVersion(current => current + 1)} />
}

function EventInfoForm({
  event,
  timezone,
  fetcher,
  onDirtyChange,
  onCancel,
}: EventInfoPanelProps & { onCancel: () => void }) {
  const { ref, changes } = useFormChanges()
  useEffect(() => onDirtyChange(changes > 0), [changes, onDirtyChange])

  return (
    <Panel title={m.programs_edit_info_title()} padded>
      <fetcher.Form id={FORM_ID} ref={ref} method="post" className="@container">
        <input type="hidden" name="intent" value="update-event" />
        <div className="grid grid-cols-2 items-end gap-3 @md:grid-cols-3 @xl:grid-cols-[minmax(200px,2fr)_repeat(3,minmax(110px,1fr))]">
          <div className="col-span-2 flex flex-col gap-1.5 @md:col-span-3 @xl:col-span-1">
            <Label htmlFor="name">{m.common_name()}</Label>
            <Input id="name" name="name" defaultValue={event.name} required />
          </div>
          <div className="col-span-2 flex min-w-0 flex-col gap-1.5 @md:col-span-1">
            <Label htmlFor="date">{m.programs_edit_date_label()}</Label>
            <DateInput id="date" name="date" defaultValue={formatDateForInput(event.startDate, timezone)} required />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="startTime">{m.programs_edit_start_time_label()}</Label>
            <Input
              id="startTime"
              name="startTime"
              type="time"
              defaultValue={formatTimeForInput(event.startDate, timezone)}
              required
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="endTime">{m.programs_edit_end_time_label()}</Label>
            <Input
              id="endTime"
              name="endTime"
              type="time"
              defaultValue={formatTimeForInput(event.endDate, timezone)}
              required
            />
          </div>
        </div>
      </fetcher.Form>
      {changes > 0 && (
        <FormSaveBar changes={changes}>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {m.common_cancel()}
          </Button>
          <SubmitButton form={FORM_ID} disabled={fetcher.state !== 'idle'}>
            {m.common_save()}
          </SubmitButton>
        </FormSaveBar>
      )}
    </Panel>
  )
}
