import type { useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { formatDateForInput, formatTimeForInput } from '~/shared/utils/event-time'

type EventInfoCardProps = {
  event: { name: string; startDate: Date; endDate: Date }
  timezone: string
  fetcher: ReturnType<typeof useFetcher>
}

export function EventInfoCard({ event, timezone, fetcher }: EventInfoCardProps) {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="text-base">{m.programs_edit_info_title()}</CardTitle>
      </CardHeader>
      <CardContent>
        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="update-event" />
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">{m.common_name()}</Label>
            <Input id="name" name="name" defaultValue={event.name} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="date">{m.programs_edit_date_label()}</Label>
            <Input
              id="date"
              name="date"
              type="date"
              defaultValue={formatDateForInput(event.startDate, timezone)}
              required
            />
          </div>
          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="startTime">{m.programs_edit_start_time_label()}</Label>
              <Input
                id="startTime"
                name="startTime"
                type="time"
                defaultValue={formatTimeForInput(event.startDate, timezone)}
                required
              />
            </div>
            <div className="flex flex-1 flex-col gap-2">
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
          <SubmitButton className="w-fit">{m.common_save()}</SubmitButton>
        </fetcher.Form>
      </CardContent>
    </Card>
  )
}
