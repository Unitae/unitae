import { Tag } from '@unitae/ui'
import { type Ref, useState } from 'react'
import type { FetcherWithComponents } from 'react-router'
import type { ScheduleTemplateView } from '~/features/settings/model/schedule-template-view'
import { NO_RESPONSIBLE } from '~/features/settings/schemas/schedule-template.schema'
import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

// Radix refuses an empty item value; « none » is also what the action reads as no responsible.
const NONE = NO_RESPONSIBLE

/**
 * Its name and responsible (design round A, « TourA-Reglages-Modeles »), and the kinds using it. Its parts or services
 * are listed under it, in its panel.
 */
export function ScheduleTemplateForm({
  template,
  roles,
  errors,
  fetcher,
  id,
  formRef,
}: {
  template: Pick<
    ScheduleTemplateView,
    'id' | 'name' | 'placeholder' | 'responsibleRoleId' | 'storedRole' | 'holders' | 'kinds'
  >
  roles: { id: number; label: string }[]
  errors: string[] | undefined
  fetcher: FetcherWithComponents<unknown>
  id: string
  formRef: Ref<HTMLFormElement>
}) {
  const saved = template.responsibleRoleId == null ? NONE : String(template.responsibleRoleId)
  const [role, setRole] = useState(saved)
  // Who holds the stored role today; nothing once another is picked, until it is saved.
  const holders =
    role !== saved || template.holders == null
      ? null
      : template.holders.length > 0
        ? m.settings_schedule_templates_holders({ names: template.holders.join(', ') })
        : m.settings_schedule_templates_holders_none()
  return (
    <fetcher.Form method="post" id={id} ref={formRef} className="flex flex-col gap-5">
      <input type="hidden" name="scheduleTemplateId" value={template.id} />
      <input type="hidden" name="responsibleRoleId" value={role} />
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
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-responsible`}>{m.settings_schedule_templates_responsible()}</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger id={`${id}-responsible`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{m.settings_schedule_templates_responsible_none()}</SelectItem>
            {/* A stored role no one may pick any more (old data) shows as it is, kept unless another is picked. */}
            {template.storedRole && (
              <SelectItem value={String(template.storedRole.id)} disabled>
                {template.storedRole.label}
              </SelectItem>
            )}
            {roles.map(each => (
              <SelectItem key={each.id} value={String(each.id)}>
                {each.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {holders && <p className="text-muted-foreground text-xs">{holders}</p>}
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
    </fetcher.Form>
  )
}
