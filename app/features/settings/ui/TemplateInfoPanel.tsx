import { Panel } from '@unitae/ui'
import { useEffect, useState } from 'react'
import { Link, type useFetcher } from 'react-router'
import { dayLabel, parseAttendanceKind } from '~/features/events'
import { AttendanceKindField } from '~/features/settings/ui/AttendanceKindField'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { ColorSwatches } from '~/shared/ui/ColorSwatches'
import { FormSaveBar } from '~/shared/ui/FormSaveBar'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

const FORM_ID = 'template-info-form'
const NONE = 'none'
const WEEK = [1, 2, 3, 4, 5, 6, 0]

interface Responsible {
  roleId: number | null
  holders: string[]
}

export interface TemplateInfo {
  name: string
  weekDay: number | null
  startTime: string
  endTime: string
  color: string
  attendanceKind: string
}

interface TemplateInfoPanelProps {
  template: TemplateInfo
  /** A built-in template: only its colour. */
  builtIn: boolean
  /** Who runs the programme and the services, for a template manager to change; absent for anyone else. */
  responsibles?: { programme: Responsible; service: Responsible; roles: { id: number; label: string }[] }
  editable: boolean
  fetcher: ReturnType<typeof useFetcher>
  onDirtyChange: (dirty: boolean) => void
}

/** The template's name, day, times and colour, and who runs it, saved from the save bar once something changed. */
export function TemplateInfoPanel(props: TemplateInfoPanelProps) {
  const [version, setVersion] = useState(0)
  const { template, responsibles } = props
  // A new starting point after « Annuler », and once a save brings the saved values back.
  const key = [version, JSON.stringify(template), responsibles?.programme.roleId, responsibles?.service.roleId].join(
    '|',
  )
  return <TemplateInfoForm key={key} {...props} onCancel={() => setVersion(current => current + 1)} />
}

function TemplateInfoForm({
  template,
  builtIn,
  responsibles,
  editable,
  fetcher,
  onDirtyChange,
  onCancel,
}: TemplateInfoPanelProps & { onCancel: () => void }) {
  const { ref, changes } = useFormChanges()
  const [color, setColor] = useState(template.color)
  useEffect(() => onDirtyChange(changes > 0), [changes, onDirtyChange])

  return (
    <Panel title={m.settings_template_info()} padded>
      <fetcher.Form id={FORM_ID} ref={ref} method="post" className="@container flex flex-col gap-4">
        <input type="hidden" name="intent" value="update-template" />
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
        {responsibles && !builtIn && (
          <div className="grid gap-3 @md:grid-cols-2">
            <AttendanceKindField value={parseAttendanceKind(template.attendanceKind)} />
          </div>
        )}
        {/* Who answers for its schedules moved to each schedule template (6a-1b, plan §11). */}
        {responsibles && !builtIn && (
          <p className="border-t pt-4 text-muted-foreground text-sm">
            {m.settings_template_responsibles_moved()}{' '}
            <Link to="/settings/schedule-templates" className="text-brand-text underline-offset-4 hover:underline">
              {m.settings_entry_schedule_templates()}
            </Link>
          </p>
        )}
      </fetcher.Form>
      {editable && changes > 0 && (
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
