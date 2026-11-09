import { Status } from '@unitae/ui'
import type { ReactNode } from 'react'

import type { AttributionState } from '~/features/territories/model/attribution-list'
import type { AttributionPanelData } from '~/features/territories/server/attribution-panel.queries'
import * as m from '~/i18n/paraglide/messages'
import { daysBetween } from '~/shared/utils/calendar-day'
import { shortDay } from '~/shared/utils/format-day'
import { cn } from '~/shared/utils/utils'

import { dueText, holderName, STATE_TONE } from './attribution-labels'

/** The bar of time gone by, in the colour of the loan's state, as on « Mes territoires ». */
const BAR: Record<AttributionState, string> = {
  'on-time': 'bg-chart-1',
  'due-soon': 'bg-warning',
  overdue: 'bg-danger',
  paused: 'bg-faint',
  orphaned: 'bg-danger',
}

/** Where the attribution stands: its loan as a bar, frozen by a campaign, or without a holder. */
export function StandingBox({
  data,
  today,
  onResume,
}: {
  data: AttributionPanelData
  today: string
  onResume: () => void
}) {
  const { attribution, publisher } = data
  const box = (children: ReactNode) => <div className="flex flex-col gap-2 rounded-md bg-subtle p-3">{children}</div>

  if (attribution.state === 'paused') {
    return box(
      <>
        <Status tone="neutral">
          {m.attributions_panel_paused_since({ date: shortDay(attribution.pausedDay ?? today, today) })}
        </Status>
        <p className="text-muted-foreground text-sm">
          {attribution.pausedBy != null
            ? m.attributions_panel_paused_body({ name: attribution.pausedBy.name })
            : m.attributions_panel_paused_body_unnamed()}
        </p>
        <button
          type="button"
          onClick={onResume}
          className="self-start rounded-md border border-border bg-card px-2.5 py-1 font-medium text-sm hover:bg-hover"
        >
          {m.attributions_panel_resume_now()}
        </button>
      </>,
    )
  }
  if (attribution.state === 'orphaned') {
    return box(
      <>
        <Status tone="danger">{m.attributions_state_orphaned()}</Status>
        <p className="text-muted-foreground text-sm">
          {publisher.anonymized || publisher.leftDay == null
            ? m.attributions_panel_gone_anonymized()
            : m.attributions_panel_gone_left({
                name: holderName(publisher),
                date: shortDay(publisher.leftDay, today),
              })}
        </p>
      </>,
    )
  }

  const total = Math.max(1, daysBetween(attribution.startDay, attribution.lateDay))
  const elapsed = Math.min(total, Math.max(0, daysBetween(attribution.startDay, today)))
  return box(
    <>
      <Status tone={STATE_TONE[attribution.state]} className="font-medium text-foreground">
        {dueText({ ...attribution, publisher }, today)}
      </Status>
      <span className="block h-1.5 overflow-hidden rounded-full bg-hover" aria-hidden="true">
        <span
          className={cn('block h-full rounded-full', BAR[attribution.state])}
          style={{ width: `${(elapsed / total) * 100}%` }}
        />
      </span>
      <span className="flex justify-between text-faint text-xs tabular-nums">
        <span>{m.attributions_panel_out_on({ date: shortDay(attribution.startDay, today) })}</span>
        <span>{m.attributions_panel_due_on({ date: shortDay(attribution.lateDay, today) })}</span>
      </span>
    </>,
  )
}
