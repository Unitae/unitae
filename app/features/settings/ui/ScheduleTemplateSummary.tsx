import { Tag } from '@unitae/ui'
import { Pencil } from 'lucide-react'
import type { ScheduleTemplateView } from '~/features/settings/model/schedule-template-view'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

type Template = Pick<ScheduleTemplateView, 'responsible' | 'holders' | 'kinds'>

/**
 * A template's name and responsible on a phone, read (design round A, « TourA-Modeles-Mobile »): who answers for it,
 * who holds that role, where it is used, and « Modifier le nom et le responsable », which opens the form in place.
 */
export function ScheduleTemplateSummary({ template, onEdit }: { template: Template; onEdit: () => void }) {
  const holders =
    template.holders == null
      ? null
      : template.holders.length > 0
        ? m.settings_schedule_templates_holders({ names: template.holders.join(', ') })
        : m.settings_schedule_templates_holders_none()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="font-medium text-sm">{m.settings_schedule_templates_responsible()}</span>
        <span className={template.responsible == null ? 'text-faint text-sm' : 'text-sm'}>
          {template.responsible ?? m.settings_schedule_templates_responsible_none()}
        </span>
        {holders && <p className="text-muted-foreground text-xs">{holders}</p>}
        <Button type="button" variant="ghost" size="sm" className="-ml-2 min-h-11 self-start" onClick={onEdit}>
          <Pencil aria-hidden="true" />
          {m.settings_schedule_templates_edit_fields()}
        </Button>
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
    </div>
  )
}
