import { FormSection } from '@unitae/ui'
import { Info } from 'lucide-react'
import { useState } from 'react'

import { campaignLength } from '~/features/territories/model/campaign-days'
import {
  type CampaignRegularEndAction,
  CampaignRegularStartAction,
} from '~/features/territories/model/campaign-lifecycle.type'
import { previewCampaignLifecycle } from '~/features/territories/model/campaign-preview'
import type { CampaignSteps } from '~/features/territories/model/campaign-progress'
import { RESTING_PERIOD_DAYS } from '~/features/territories/model/resting-periods'
import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

import { EndSection, StartSection } from './CampaignFormSections'
import { CampaignScopePicker, type ScopeTerritory } from './CampaignScopePicker'
import { CampaignTimeline } from './CampaignTimeline'

export interface CampaignFormDefaults {
  name: string
  notes: string
  /** `YYYY-MM-DD`, empty for a new campaign. */
  startDate: string
  endDate: string
  restPeriodDays: number | null
  startRegularAction: CampaignRegularStartAction
  startAutoReassign: boolean
  endCloseCampaign: boolean
  endRegularAction: CampaignRegularEndAction
  scopeTerritoryIds: number[]
}

export type CampaignFormTerritory = ScopeTerritory

/** `started`: its start has run, so its first day and start options stay; `ended`: only its name and notes change. */
export type CampaignFormLock = 'none' | 'started' | 'ended'

const STEPS: Record<Exclude<CampaignFormLock, 'ended'>, CampaignSteps> = {
  none: { start: 'next', during: 'next', end: 'next', rest: 'next' },
  started: { start: 'done', during: 'now', end: 'next', rest: 'next' },
}

interface CampaignFormProps {
  defaults: CampaignFormDefaults
  territories: CampaignFormTerritory[]
  errors?: Record<string, string[] | undefined>
  lock?: CampaignFormLock
}

/**
 * The campaign's form in sections, with what will happen beside it, following the choices before they are saved.
 * Field names match `campaignSchema`; a locked field still sends its value through a hidden input.
 */
export function CampaignForm({ defaults, territories, errors, lock = 'none' }: CampaignFormProps) {
  const [startAction, setStartAction] = useState<string>(defaults.startRegularAction)
  const [autoReassign, setAutoReassign] = useState(defaults.startAutoReassign)
  const [endClose, setEndClose] = useState(defaults.endCloseCampaign)
  const [endAction, setEndAction] = useState<string>(defaults.endRegularAction)
  const [startDate, setStartDate] = useState(defaults.startDate)
  const [endDate, setEndDate] = useState(defaults.endDate)
  const [rest, setRest] = useState(defaults.restPeriodDays == null ? '' : String(defaults.restPeriodDays))
  const startLocked = lock === 'started'
  const paused = startAction === CampaignRegularStartAction.Pause
  const length = startDate !== '' && endDate !== '' && endDate >= startDate ? campaignLength(startDate, endDate) : null

  const infos = (
    <FormSection title={m.campaigns_form_infos_legend()} description={m.campaigns_form_infos_description()}>
      <div className="col-span-full flex flex-col gap-1.5">
        <Label htmlFor="campaign-name">{m.campaigns_form_name_label()}</Label>
        <Input id="campaign-name" name="name" defaultValue={defaults.name} aria-invalid={errors?.name != null} />
        {errors?.name && <p className="text-destructive text-sm">{errors.name}</p>}
      </div>
      <div className="col-span-full flex flex-col gap-1.5">
        <Label htmlFor="campaign-notes">{m.campaigns_form_notes_label()}</Label>
        <textarea
          id="campaign-notes"
          name="notes"
          defaultValue={defaults.notes}
          aria-describedby="campaign-notes-help"
          className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <p id="campaign-notes-help" className="text-faint text-xs">
          {m.campaigns_form_notes_help()}
        </p>
      </div>
    </FormSection>
  )

  if (lock === 'ended') {
    return (
      <div className="flex flex-col gap-6">
        <p className="flex items-start gap-2 rounded-md bg-sidebar px-3 py-2.5 text-muted-foreground text-sm">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-faint" />
          {m.campaigns_form_ended_hint()}
        </p>
        {infos}
        <LockedValues defaults={defaults} />
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[3_1_36rem] flex-col gap-6">
        {infos}

        <FormSection title={m.campaigns_form_dates_legend()} description={m.campaigns_form_dates_description()}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaign-start-date">{m.campaigns_form_start_date_label()}</Label>
            {startLocked && <input type="hidden" name="start-date" value={defaults.startDate} />}
            <Input
              id="campaign-start-date"
              name={startLocked ? undefined : 'start-date'}
              type="date"
              value={startDate}
              onChange={event => setStartDate(event.target.value)}
              disabled={startLocked}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaign-end-date">{m.campaigns_form_end_date_label()}</Label>
            <Input
              id="campaign-end-date"
              name="end-date"
              type="date"
              value={endDate}
              onChange={event => setEndDate(event.target.value)}
              aria-invalid={errors?.['end-date'] != null}
            />
            {errors?.['end-date'] && <p className="text-destructive text-sm">{errors['end-date']}</p>}
          </div>
          {length != null && (
            <p className="col-span-full text-faint text-sm tabular-nums">
              {m.campaigns_form_dates_length_hint({ days: length })}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaign-rest-period">{m.campaigns_form_rest_label()}</Label>
            <Input
              id="campaign-rest-period"
              name="rest-period-days"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder={m.campaigns_form_rest_placeholder()}
              value={rest}
              onChange={event => setRest(event.target.value)}
              aria-describedby="campaign-rest-help"
            />
            <p id="campaign-rest-help" className="text-faint text-xs">
              {m.campaigns_form_rest_help()}
            </p>
          </div>
        </FormSection>

        <StartSection
          locked={startLocked}
          defaults={defaults}
          value={startAction}
          onValueChange={setStartAction}
          autoReassign={autoReassign}
          onAutoReassignChange={setAutoReassign}
          error={errors?.['start-auto-reassign']}
        />

        <EndSection
          paused={paused}
          defaultEndAction={defaults.endRegularAction}
          endClose={endClose}
          onEndCloseChange={setEndClose}
          value={endAction}
          onValueChange={setEndAction}
        />

        <FormSection title={m.campaigns_form_scope_legend()} description={m.campaigns_form_scope_description()}>
          <CampaignScopePicker territories={territories} defaultSelectedIds={defaults.scopeTerritoryIds} />
        </FormSection>
      </div>

      <aside className="min-w-0 flex-[1_1_18rem] lg:sticky lg:top-4">
        <CampaignTimeline
          steps={STEPS[lock]}
          preview={previewCampaignLifecycle({
            startRegularAction: startAction,
            startAutoReassign: autoReassign && paused,
            endCloseCampaign: endClose,
            endRegularAction: endAction,
          })}
          startDay={startDate}
          endDay={endDate}
          restDays={Number(rest) > 0 ? Number(rest) : RESTING_PERIOD_DAYS.campaign}
          forecast
        />
      </aside>
    </div>
  )
}

/** An ended campaign's settings, sent unchanged: the schema wants them, the campaign keeps its own. */
function LockedValues({ defaults }: { defaults: CampaignFormDefaults }) {
  return (
    <>
      <input type="hidden" name="start-date" value={defaults.startDate} />
      <input type="hidden" name="end-date" value={defaults.endDate} />
      {defaults.restPeriodDays != null && (
        <input type="hidden" name="rest-period-days" value={defaults.restPeriodDays} />
      )}
      <input type="hidden" name="start-regular-action" value={defaults.startRegularAction} />
      {defaults.startAutoReassign && <input type="hidden" name="start-auto-reassign" value="on" />}
      {defaults.endCloseCampaign && <input type="hidden" name="end-close-campaign" value="on" />}
      <input type="hidden" name="end-regular-action" value={defaults.endRegularAction} />
      {defaults.scopeTerritoryIds.map(id => (
        <input key={id} type="hidden" name="scope" value={id} />
      ))}
    </>
  )
}
