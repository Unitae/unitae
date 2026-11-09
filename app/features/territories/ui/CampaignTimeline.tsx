import { Panel } from '@unitae/ui'

import { formatCampaignDay } from '~/features/territories/model/campaign-days'
import type { CampaignLifecyclePreview } from '~/features/territories/model/campaign-preview'
import type { CampaignSteps, StepState } from '~/features/territories/model/campaign-progress'
import * as m from '~/i18n/paraglide/messages'
import { addDays } from '~/shared/utils/calendar-day'
import { cn } from '~/shared/utils/utils'

type Tense = 'next' | 'done'

const START: Record<CampaignLifecyclePreview['start'][number], Record<Tense, () => string>> = {
  pause: { next: m.campaigns_tl_pause_next, done: m.campaigns_tl_pause_done },
  reassign: { next: m.campaigns_tl_reassign_next, done: m.campaigns_tl_reassign_done },
  close: { next: m.campaigns_tl_close_next, done: m.campaigns_tl_close_done },
  leave: { next: m.campaigns_tl_leave_next, done: m.campaigns_tl_leave_done },
}

const END: Record<Exclude<CampaignLifecyclePreview['end'][number], 'close-campaign'>, Record<Tense, () => string>> = {
  'leave-campaign-open': { next: m.campaigns_tl_leave_open_next, done: m.campaigns_tl_leave_open_done },
  resume: { next: m.campaigns_tl_resume_next, done: m.campaigns_tl_resume_done },
  'keep-paused': { next: m.campaigns_tl_keep_next, done: m.campaigns_tl_keep_done },
  'close-regulars': { next: m.campaigns_tl_close_regulars_next, done: m.campaigns_tl_close_regulars_done },
}

interface CampaignTimelineProps {
  steps: CampaignSteps
  preview: CampaignLifecyclePreview
  /** `YYYY-MM-DD`; empty while the form has no date yet. */
  startDay: string
  endDay: string
  restDays: number
  /** The form's preview: what will happen, before saving. */
  forecast?: boolean
}

/**
 * A campaign's four steps — start, during, end, rest — each saying what it does to the territories, in the past once
 * done. The same list previews the form's choices before they are saved.
 */
export function CampaignTimeline({
  steps,
  preview,
  startDay,
  endDay,
  restDays,
  forecast = false,
}: CampaignTimelineProps) {
  const tense = (state: StepState): Tense => (state === 'done' ? 'done' : 'next')
  const day = (value: string) => (value ? formatCampaignDay(value) : null)
  const closeCampaign = () => {
    if (steps.end === 'done') return m.campaigns_tl_close_campaign_done()
    if (!endDay) return m.campaigns_tl_close_campaign_undated()
    return m.campaigns_tl_close_campaign_next({
      date: formatCampaignDay(addDays(endDay, 1), { day: 'numeric', month: 'short' }),
    })
  }
  const endSentence = (key: CampaignLifecyclePreview['end'][number]) =>
    key === 'close-campaign' ? closeCampaign() : END[key][tense(steps.end)]()

  return (
    <Panel title={forecast ? m.campaigns_timeline_preview_title() : m.campaigns_timeline_title()}>
      {forecast && <p className="px-4 pt-1 text-faint text-sm">{m.campaigns_timeline_preview_sub()}</p>}
      <ol className="flex flex-col px-4 pt-1 pb-3">
        <Step state={steps.start} label={m.campaigns_step_start()} detail={day(startDay)}>
          {preview.start.map(key => START[key][tense(steps.start)]()).join(' ')}
        </Step>
        <Step
          state={steps.during}
          label={m.campaigns_step_during()}
          detail={steps.during === 'now' ? m.campaigns_step_now() : null}
        >
          {steps.during === 'now'
            ? m.campaigns_tl_during_now()
            : steps.during === 'done'
              ? m.campaigns_tl_during_done()
              : m.campaigns_tl_during_next()}
        </Step>
        <Step state={steps.end} label={m.campaigns_step_end()} detail={day(endDay)}>
          {preview.end.map(endSentence).join(' ')}
        </Step>
        <Step
          state={steps.rest}
          label={m.campaigns_step_rest()}
          detail={
            restDays > 1 ? m.campaigns_length_other({ count: restDays }) : m.campaigns_length_one({ count: restDays })
          }
          last
        >
          {restDays > 1 ? m.campaigns_tl_rest_other({ count: restDays }) : m.campaigns_tl_rest_one({ count: restDays })}
        </Step>
      </ol>
    </Panel>
  )
}

const STATE_LABEL: Record<StepState, () => string> = {
  done: m.campaigns_step_done,
  now: m.campaigns_step_now,
  next: m.campaigns_step_next,
}

function Step({
  state,
  label,
  detail,
  last = false,
  children,
}: {
  state: StepState
  label: string
  detail: string | null
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <li className="relative grid grid-cols-[20px_1fr] gap-3 py-2.5">
      {!last && (
        <span
          aria-hidden="true"
          className={cn('absolute top-8 bottom-[-10px] left-[9px] w-0.5', state === 'done' ? 'bg-brand' : 'bg-border')}
        />
      )}
      <span
        aria-hidden="true"
        className={cn(
          'mt-px grid size-5 place-content-center rounded-full',
          state === 'done' && 'bg-brand text-white',
          state === 'now' && 'border-2 border-brand bg-surface',
          state === 'next' && 'border-2 border-border-strong bg-surface',
        )}
      >
        {state === 'done' && (
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className="size-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m2.5 6.2 2.2 2.2 4.8-4.8" />
          </svg>
        )}
        {state === 'now' && <span className="size-2 rounded-full bg-brand" />}
      </span>
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-medium">{label}</span>
          {detail && <span className="text-faint text-sm tabular-nums">{detail}</span>}
          <span className="sr-only">{STATE_LABEL[state]()}</span>
        </div>
        <p className="text-muted-foreground text-sm">{children}</p>
      </div>
    </li>
  )
}
