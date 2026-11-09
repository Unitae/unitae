import { FormSection } from '@unitae/ui'

import {
  CampaignRegularEndAction,
  CampaignRegularStartAction,
} from '~/features/territories/model/campaign-lifecycle.type'
import * as m from '~/i18n/paraglide/messages'
import { Checkbox } from '~/shared/ui/checkbox'
import { Label } from '~/shared/ui/label'

import { CampaignOptionCards } from './CampaignOptionCards'

/**
 * What becomes of the regular attributions still out on the first day. Once the campaign has started, the choice made
 * shows disabled and goes out through hidden inputs.
 */
export function StartSection({
  locked,
  defaults,
  value,
  onValueChange,
  autoReassign,
  onAutoReassignChange,
  error,
}: {
  locked: boolean
  defaults: { startRegularAction: string; startAutoReassign: boolean }
  value: string
  onValueChange: (value: string) => void
  autoReassign: boolean
  onAutoReassignChange: (value: boolean) => void
  error?: string[]
}) {
  return (
    <FormSection title={m.campaigns_form_start_legend()} description={m.campaigns_form_start_description()}>
      {locked && (
        <>
          <p className="col-span-full text-faint text-sm">{m.campaigns_form_start_locked_hint()}</p>
          <input type="hidden" name="start-regular-action" value={defaults.startRegularAction} />
          {defaults.startAutoReassign && <input type="hidden" name="start-auto-reassign" value="on" />}
        </>
      )}
      <CampaignOptionCards
        id="campaign-start-action"
        name={locked ? undefined : 'start-regular-action'}
        label={m.campaigns_form_start_action_label()}
        value={value}
        onValueChange={onValueChange}
        disabled={locked}
        options={[
          {
            value: CampaignRegularStartAction.Pause,
            label: m.campaigns_form_start_action_pause(),
            description: m.campaigns_form_start_action_pause_desc(),
            extra: (
              <span className="mt-1.5 flex items-center gap-2">
                <Checkbox
                  id="campaign-auto-reassign"
                  name={locked ? undefined : 'start-auto-reassign'}
                  value="on"
                  checked={autoReassign}
                  disabled={locked}
                  onCheckedChange={checked => onAutoReassignChange(checked === true)}
                />
                <Label htmlFor="campaign-auto-reassign" className="font-normal text-sm">
                  {m.campaigns_form_auto_reassign_label()}
                </Label>
              </span>
            ),
          },
          {
            value: CampaignRegularStartAction.Close,
            label: m.campaigns_form_start_action_close(),
            description: m.campaigns_form_start_action_close_desc(),
          },
          {
            value: CampaignRegularStartAction.Leave,
            label: m.campaigns_form_start_action_leave(),
            description: m.campaigns_form_start_action_leave_desc(),
          },
        ]}
      />
      {error && <p className="col-span-full text-destructive text-sm">{error}</p>}
    </FormSection>
  )
}

/** What happens the day after the last one: the campaign's territories still out, and the attributions it paused. */
export function EndSection({
  paused,
  defaultEndAction,
  endClose,
  onEndCloseChange,
  value,
  onValueChange,
}: {
  /** The campaign pauses regular attributions at its start: only then is there anything to resume. */
  paused: boolean
  defaultEndAction: string
  endClose: boolean
  onEndCloseChange: (value: boolean) => void
  value: string
  onValueChange: (value: string) => void
}) {
  return (
    <FormSection title={m.campaigns_form_end_legend()} description={m.campaigns_form_end_description()}>
      <div className="col-span-full flex items-start gap-2.5">
        <Checkbox
          id="campaign-end-close"
          name="end-close-campaign"
          value="on"
          checked={endClose}
          onCheckedChange={checked => onEndCloseChange(checked === true)}
          className="mt-0.5"
        />
        <span className="flex flex-col gap-0.5">
          <Label htmlFor="campaign-end-close">{m.campaigns_form_end_close_label()}</Label>
          <span className="text-muted-foreground text-sm">{m.campaigns_form_end_close_help()}</span>
        </span>
      </div>
      {paused ? (
        <CampaignOptionCards
          id="campaign-end-action"
          name="end-regular-action"
          label={m.campaigns_form_end_action_label()}
          value={value}
          onValueChange={onValueChange}
          options={[
            {
              value: CampaignRegularEndAction.Resume,
              label: m.campaigns_form_end_action_resume(),
              description: m.campaigns_form_end_action_resume_desc(),
            },
            {
              value: CampaignRegularEndAction.KeepPaused,
              label: m.campaigns_form_end_action_keep(),
              description: m.campaigns_form_end_action_keep_desc(),
            },
            {
              value: CampaignRegularEndAction.Close,
              label: m.campaigns_form_end_action_close(),
              description: m.campaigns_form_end_action_close_desc(),
            },
          ]}
        />
      ) : (
        <input type="hidden" name="end-regular-action" value={defaultEndAction} />
      )}
    </FormSection>
  )
}
