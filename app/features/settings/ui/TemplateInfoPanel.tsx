import { Panel } from '@unitae/ui'
import { useEffect, useState } from 'react'
import type { useFetcher } from 'react-router'
import { dayLabel } from '~/features/events'
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
          <div className="grid gap-3 border-t pt-4 @md:grid-cols-2">
            <ResponsibleField
              id="template-programme-responsible"
              name="programmeRoleId"
              label={m.settings_template_programme_responsible()}
              hint={m.settings_template_responsible_programme_hint()}
              responsible={responsibles.programme}
              roles={responsibles.roles}
            />
            <ResponsibleField
              id="template-service-responsible"
              name="serviceRoleId"
              label={m.settings_template_service_responsible()}
              hint={m.settings_template_responsible_service_hint()}
              responsible={responsibles.service}
              roles={responsibles.roles}
            />
          </div>
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

interface ResponsibleFieldProps {
  id: string
  name: string
  label: string
  hint: string
  responsible: Responsible
  roles: { id: number; label: string }[]
}

/** A role that runs part of the template, and who holds it today while it is the saved one. */
function ResponsibleField({ id, name, label, hint, responsible, roles }: ResponsibleFieldProps) {
  const saved = responsible.roleId == null ? NONE : String(responsible.roleId)
  const [value, setValue] = useState(saved)
  const holders =
    value === saved && responsible.roleId != null
      ? responsible.holders.length > 0
        ? m.settings_template_holders({ names: responsible.holders.join(', ') })
        : m.settings_template_holders_none()
      : null

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select name={name} value={value} onValueChange={setValue}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{m.settings_templates_managers()}</SelectItem>
          {roles.map(role => (
            <SelectItem key={role.id} value={String(role.id)}>
              {role.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-faint text-xs">{holders ? `${holders} ${hint}` : hint}</p>
    </div>
  )
}
