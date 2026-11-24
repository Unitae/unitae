import { Tag } from '@unitae/ui'
import { type Ref, useState } from 'react'
import type { FetcherWithComponents } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

// Radix refuses an empty item value: « none » stands for those who manage the programmes, posted as blank.
const NONE = 'none'

/** One schedule template as its side panel edits it. */
export interface ScheduleTemplateValues {
  id: number
  name: string
  /** Shown when the name is left blank: its kind's label, for a keyed template. */
  placeholder: string
  responsibleRoleId: number | null
  kinds: string[]
}

/**
 * Its name and responsible (design round A, « TourA-Reglages-Modeles »), and the kinds suggesting it. Its parts or
 * services are still edited from the kind until 6a-1c.
 */
export function ScheduleTemplateForm({
  template,
  roles,
  errors,
  fetcher,
  id,
  formRef,
}: {
  template: ScheduleTemplateValues
  roles: { id: number; label: string }[]
  errors: string[] | undefined
  fetcher: FetcherWithComponents<unknown>
  id: string
  formRef: Ref<HTMLFormElement>
}) {
  const [role, setRole] = useState(template.responsibleRoleId == null ? NONE : String(template.responsibleRoleId))
  return (
    <fetcher.Form method="post" id={id} ref={formRef} className="flex flex-col gap-5">
      <input type="hidden" name="scheduleTemplateId" value={template.id} />
      <input type="hidden" name="responsibleRoleId" value={role === NONE ? '' : role} />
      {errors && errors.length > 0 && (
        <p role="alert" className="text-destructive text-sm">
          {errors[0]}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-name`}>{m.settings_schedule_templates_name()}</Label>
        <Input
          id={`${id}-name`}
          name="name"
          defaultValue={template.name}
          placeholder={template.placeholder}
          maxLength={80}
        />
        <p className="text-faint text-xs">{m.settings_schedule_templates_name_hint()}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-responsible`}>{m.settings_schedule_templates_responsible()}</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger id={`${id}-responsible`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{m.settings_schedule_templates_responsible_none()}</SelectItem>
            {roles.map(each => (
              <SelectItem key={each.id} value={String(each.id)}>
                {each.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-faint text-xs">{m.settings_schedule_templates_responsible_hint()}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-sm">{m.settings_schedule_templates_suggested_by()}</span>
        {template.kinds.length > 0 ? (
          <span className="flex flex-wrap gap-1.5">
            {template.kinds.map(kind => (
              <Tag key={kind}>{kind}</Tag>
            ))}
          </span>
        ) : (
          <p className="text-faint text-sm">{m.settings_schedule_templates_suggested_none()}</p>
        )}
      </div>
      <p className="rounded-md bg-sidebar px-3 py-2.5 text-muted-foreground text-sm">
        {m.settings_schedule_templates_items_note()}
      </p>
    </fetcher.Form>
  )
}
