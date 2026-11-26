import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import type { ScheduleTemplateView } from './schedule-template-view'

/**
 * What « Supprimer le modèle » says goes and stays (design round A): the kinds that use it no longer do, or it is
 * offered no more; the schedules made from it keep their content, and lose their responsible when it had one.
 */
export function scheduleTemplateDeleteLines(
  template: Pick<ScheduleTemplateView, 'kind' | 'kinds' | 'schedules' | 'responsible'>,
): string[] {
  const kinds = new Intl.ListFormat(getLocale(), { type: 'conjunction' }).format(template.kinds)
  const count = template.schedules
  const kept =
    template.kind === 'duty'
      ? m.settings_schedule_templates_delete_schedules_services({ count })
      : m.settings_schedule_templates_delete_schedules_parts({ count })
  return [
    template.kinds.length > 0
      ? m.settings_schedule_templates_delete_kinds({ count: template.kinds.length, kinds })
      : m.settings_schedule_templates_delete_unused(),
    ...(count > 0 ? [kept] : []),
    ...(count > 0 && template.responsible != null ? [m.settings_schedule_templates_delete_responsible({ count })] : []),
  ]
}
