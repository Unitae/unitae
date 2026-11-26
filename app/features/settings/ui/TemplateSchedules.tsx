import { Panel } from '@unitae/ui'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import type { ScheduleTemplateView } from '~/features/settings/model/schedule-template-view'
import * as m from '~/i18n/paraglide/messages'

export type TemplateScheduleRow = Pick<ScheduleTemplateView, 'id' | 'title' | 'detail' | 'responsible'>

/**
 * The schedule templates a meeting type uses (« TourA-Reglages-Types »'s « Plannings »), read only: each opens in
 * « Modèles de planning », where its parts or services are set. Choosing them stays with the kinds' round (6b).
 */
export function TemplateSchedules({ rows }: { rows: TemplateScheduleRow[] }) {
  return (
    <Panel title={m.settings_template_schedules_title()} padded>
      <div className="flex flex-col gap-3">
        <p className="text-faint text-xs">{m.settings_template_schedules_hint()}</p>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{m.settings_template_schedules_empty()}</p>
        ) : (
          <ul className="flex flex-col rounded-md border border-border">
            {rows.map(row => (
              <li key={row.id} className="border-border border-b last:border-b-0">
                <Link
                  to={`/settings/schedule-templates?template=${row.id}`}
                  className="flex min-h-11 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors duration-(--u-duration-fast) hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{row.title}</span>
                    <span className="text-faint text-xs">
                      {[row.detail, row.responsible ?? m.settings_schedule_templates_responsible_none()].join(' · ')}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
