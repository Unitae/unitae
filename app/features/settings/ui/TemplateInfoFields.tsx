import { type Ref, useState } from 'react'
import { Link, type useFetcher } from 'react-router'
import { dayLabel, parseAttendanceKind } from '~/features/events'
import { AttendanceKindField } from '~/features/settings/ui/AttendanceKindField'
import * as m from '~/i18n/paraglide/messages'
import { ColorSwatches } from '~/shared/ui/ColorSwatches'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

const NONE = 'none'
const WEEK = [1, 2, 3, 4, 5, 6, 0]

export interface TemplateInfo {
  name: string
  weekDay: number | null
  startTime: string
  endTime: string
  color: string
  attendanceKind: string
}

interface TemplateInfoFieldsProps {
  template: TemplateInfo
  /** A built-in template: only its colour. */
  builtIn: boolean
  /** A template manager: how its meetings count in attendance, and where its responsibles are set. */
  manager: boolean
  editable: boolean
  fetcher: ReturnType<typeof useFetcher>
}

/**
 * A type's name, day, hours, colour and attendance as a form of their own: the side panel of « Types d’évènement »
 * draws its save (6b-2b), and `typeId` names the type the list's action writes.
 */
export function TemplateInfoFields({
  formId,
  formRef,
  typeId,
  template,
  builtIn,
  manager,
  editable,
  fetcher,
}: TemplateInfoFieldsProps & {
  formId: string
  formRef: Ref<HTMLFormElement>
  typeId?: number
}) {
  const [color, setColor] = useState(template.color)
  return (
    <fetcher.Form id={formId} ref={formRef} method="post" className="@container flex flex-col gap-4">
      <input type="hidden" name="intent" value="update-template" />
      {typeId != null && <input type="hidden" name="typeId" value={typeId} />}
      {!builtIn && (
        <div className="grid grid-cols-2 items-end gap-3 @xl:grid-cols-[minmax(200px,2fr)_repeat(3,minmax(110px,1fr))]">
          <div className="col-span-2 flex flex-col gap-1.5 @xl:col-span-1">
            <Label htmlFor="template-name">{m.common_name()}</Label>
            <Input id="template-name" name="name" defaultValue={template.name} required disabled={!editable} />
          </div>
          <div className="col-span-2 flex min-w-0 flex-col gap-1.5 @md:col-span-1">
            <Label htmlFor="template-weekday">{m.settings_template_edit_weekday_label()}</Label>
            <Select
              name="weekDay"
              defaultValue={template.weekDay == null ? NONE : String(template.weekDay)}
              disabled={!editable}
            >
              <SelectTrigger id="template-weekday" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{m.settings_templates_one_time()}</SelectItem>
                {WEEK.map(day => (
                  <SelectItem key={day} value={String(day)}>
                    {dayLabel(day)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="template-start">{m.settings_template_edit_start_time_label()}</Label>
            <Input
              id="template-start"
              name="startTime"
              type="time"
              defaultValue={template.startTime}
              required
              disabled={!editable}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="template-end">{m.settings_template_edit_end_time_label()}</Label>
            <Input
              id="template-end"
              name="endTime"
              type="time"
              defaultValue={template.endTime}
              required
              disabled={!editable}
            />
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-sm">{m.settings_template_edit_color_label()}</span>
        {editable ? (
          <ColorSwatches
            label={m.settings_template_edit_color_label()}
            name="color"
            value={color}
            onChange={setColor}
          />
        ) : (
          <span aria-hidden="true" className="size-5 rounded-full" style={{ backgroundColor: template.color }} />
        )}
        <p className="text-faint text-xs">{m.settings_template_color_hint()}</p>
      </div>
      {manager && !builtIn && (
        <div className="grid gap-3 @md:grid-cols-2">
          <AttendanceKindField value={parseAttendanceKind(template.attendanceKind)} />
        </div>
      )}
      {/* Who answers for its schedules moved to each schedule template (6a-1b, plan §11). */}
      {manager && !builtIn && (
        <p className="border-t pt-4 text-muted-foreground text-sm">
          {m.settings_template_responsibles_moved()}{' '}
          <Link to="/settings/schedule-templates" className="text-brand-text underline-offset-4 hover:underline">
            {m.settings_entry_schedule_templates()}
          </Link>
        </p>
      )}
    </fetcher.Form>
  )
}
