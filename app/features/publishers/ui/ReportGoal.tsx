import { ProgressBar } from '@unitae/ui'

import * as m from '~/i18n/paraglide/messages'

interface ReportGoalProps {
  /** « octobre » */
  monthName: string
  goal: number
  hours: number
  /** The credit counted with the hours; 0 when there is none or the reader may not see it. */
  credit: number
  /** Where the goal comes from: the month's enrolment, or the congregation's rate for the service chosen. */
  source: 'enrolment' | 'rate'
  /** The service in lower case, for « Taux de l'assemblée pour un pionnier auxiliaire ». */
  serviceName: string
}

/** The month's objective and how far the report goes, counted as it is typed: hours plus credit. */
export function ReportGoal({ monthName, goal, hours, credit, source, serviceName }: ReportGoalProps) {
  const total = hours + credit
  const met = goal > 0 && total >= goal
  const title = m.report_panel_goal_title({ month: monthName })

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset needs form controls; this is a read-out the inputs feed
    <div role="group" aria-label={title} className="flex flex-col gap-1.5 rounded-md bg-sidebar px-3 pt-2.5 pb-3">
      <div className="flex items-baseline justify-between gap-2 font-medium text-sm">
        <span>{title}</span>
        <b className="font-semibold text-lg tabular-nums">{m.activity_hours_value({ hours: goal })}</b>
      </div>
      <ProgressBar value={total} max={goal} size="md" tone={met ? 'success' : 'muted'} />
      <span className="text-sm tabular-nums" aria-live="polite">
        {met
          ? m.report_panel_goal_met({ total, goal })
          : m.report_panel_goal_short({ total, goal, missing: Math.max(goal - total, 0) })}
      </span>
      <span className="text-faint text-xs">
        {credit > 0
          ? m.report_panel_goal_with_credit({ hours, credit })
          : source === 'enrolment'
            ? m.report_panel_goal_from_enrolment()
            : m.report_panel_goal_from_rate({ service: serviceName })}
      </span>
    </div>
  )
}
