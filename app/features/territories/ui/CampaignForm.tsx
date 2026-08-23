import { useMemo, useState } from 'react'
import {
  CampaignRegularEndAction,
  CampaignRegularStartAction,
} from '~/features/territories/model/campaign-lifecycle.type'
import { previewCampaignLifecycle } from '~/features/territories/model/campaign-preview'
import * as m from '~/i18n/paraglide/messages'
import { Checkbox } from '~/shared/ui/checkbox'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

export interface CampaignFormDefaults {
  name: string
  notes: string
  startDate: string
  endDate: string
  durationDays: number | null
  startRegularAction: CampaignRegularStartAction
  startAutoReassign: boolean
  endCloseCampaign: boolean
  endRegularAction: CampaignRegularEndAction
  scopeTerritoryIds: number[]
}

export interface CampaignFormTerritory {
  id: number
  number: string
  type: string
}

const startPreviewLabels: Record<string, () => string> = {
  pause: m.campaigns_preview_start_pause,
  reassign: m.campaigns_preview_start_reassign,
  close: m.campaigns_preview_start_close,
  leave: m.campaigns_preview_start_leave,
}
const endPreviewLabels: Record<string, () => string> = {
  'close-campaign': m.campaigns_preview_end_close_campaign,
  'leave-campaign-open': m.campaigns_preview_end_leave_open,
  resume: m.campaigns_preview_end_resume,
  'keep-paused': m.campaigns_preview_end_keep,
  'close-regulars': m.campaigns_preview_end_close_regulars,
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border p-4">
      <legend className="px-1 font-medium text-sm">{legend}</legend>
      {children}
    </fieldset>
  )
}

/**
 * The option sections of the campaign create/edit form. Field names match
 * `campaignSchema`; the lifecycle preview re-renders live from the four
 * controlled options so consequences are visible before saving.
 */
export function CampaignForm({
  defaults,
  territories,
  errors,
}: {
  defaults: CampaignFormDefaults
  territories: CampaignFormTerritory[]
  errors?: Record<string, string[] | undefined>
}) {
  const [startAction, setStartAction] = useState<string>(defaults.startRegularAction)
  const [autoReassign, setAutoReassign] = useState(defaults.startAutoReassign)
  const [endClose, setEndClose] = useState(defaults.endCloseCampaign)
  const [endAction, setEndAction] = useState<string>(defaults.endRegularAction)
  const [scopeSearch, setScopeSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set(defaults.scopeTerritoryIds))

  const preview = previewCampaignLifecycle({
    startRegularAction: startAction,
    startAutoReassign: autoReassign && startAction === CampaignRegularStartAction.Pause,
    endCloseCampaign: endClose,
    endRegularAction: endAction,
  })

  const visibleTerritories = useMemo(() => {
    const needle = scopeSearch.trim().toLowerCase()
    if (needle === '') return territories
    return territories.filter(t => t.number.toLowerCase().includes(needle))
  }, [territories, scopeSearch])

  const toggle = (id: number, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Fieldset legend={m.campaigns_form_infos_legend()}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-name">{m.campaigns_form_name_label()}</Label>
          <Input id="campaign-name" name="name" defaultValue={defaults.name} aria-invalid={errors?.name != null} />
          {errors?.name && <p className="text-destructive text-sm">{errors.name}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-notes">{m.campaigns_form_notes_label()}</Label>
          <textarea
            id="campaign-notes"
            name="notes"
            defaultValue={defaults.notes}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </Fieldset>

      <Fieldset legend={m.campaigns_form_dates_legend()}>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="campaign-start-date">{m.campaigns_form_start_date_label()}</Label>
            <Input id="campaign-start-date" name="start-date" type="date" defaultValue={defaults.startDate} />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="campaign-end-date">{m.campaigns_form_end_date_label()}</Label>
            <Input id="campaign-end-date" name="end-date" type="date" defaultValue={defaults.endDate} />
            {errors?.['end-date'] && <p className="text-destructive text-sm">{errors['end-date']}</p>}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-duration">{m.campaigns_form_duration_label()}</Label>
          <Input
            id="campaign-duration"
            name="duration-days"
            type="number"
            min={1}
            defaultValue={defaults.durationDays ?? ''}
          />
          <p className="text-muted-foreground text-xs">{m.campaigns_form_duration_help()}</p>
        </div>
      </Fieldset>

      <Fieldset legend={m.campaigns_form_start_legend()}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-start-action">{m.campaigns_form_start_action_label()}</Label>
          <Select name="start-regular-action" defaultValue={defaults.startRegularAction} onValueChange={setStartAction}>
            <SelectTrigger id="campaign-start-action" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CampaignRegularStartAction.Pause}>{m.campaigns_form_start_action_pause()}</SelectItem>
              <SelectItem value={CampaignRegularStartAction.Close}>{m.campaigns_form_start_action_close()}</SelectItem>
              <SelectItem value={CampaignRegularStartAction.Leave}>{m.campaigns_form_start_action_leave()}</SelectItem>
            </SelectContent>
          </Select>
          {startAction === CampaignRegularStartAction.Leave && (
            <p className="text-muted-foreground text-xs">{m.campaigns_form_start_action_leave_help()}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="campaign-auto-reassign"
            name="start-auto-reassign"
            value="on"
            checked={autoReassign && startAction === CampaignRegularStartAction.Pause}
            disabled={startAction !== CampaignRegularStartAction.Pause}
            onCheckedChange={checked => setAutoReassign(checked === true)}
          />
          <Label htmlFor="campaign-auto-reassign" className="font-normal text-sm">
            {m.campaigns_form_auto_reassign_label()}
          </Label>
        </div>
        {errors?.['start-auto-reassign'] && <p className="text-destructive text-sm">{errors['start-auto-reassign']}</p>}
      </Fieldset>

      <Fieldset legend={m.campaigns_form_end_legend()}>
        <div className="flex items-center gap-2">
          <Checkbox
            id="campaign-end-close"
            name="end-close-campaign"
            value="on"
            checked={endClose}
            onCheckedChange={checked => setEndClose(checked === true)}
          />
          <Label htmlFor="campaign-end-close" className="font-normal text-sm">
            {m.campaigns_form_end_close_label()}
          </Label>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-end-action">{m.campaigns_form_end_action_label()}</Label>
          <Select name="end-regular-action" defaultValue={defaults.endRegularAction} onValueChange={setEndAction}>
            <SelectTrigger id="campaign-end-action" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CampaignRegularEndAction.Resume}>{m.campaigns_form_end_action_resume()}</SelectItem>
              <SelectItem value={CampaignRegularEndAction.KeepPaused}>{m.campaigns_form_end_action_keep()}</SelectItem>
              <SelectItem value={CampaignRegularEndAction.Close}>{m.campaigns_form_end_action_close()}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Fieldset>

      <Fieldset legend={m.campaigns_form_scope_legend()}>
        <p className="text-muted-foreground text-xs">{m.campaigns_form_scope_help()}</p>
        <Input
          type="search"
          placeholder={m.campaigns_form_scope_search()}
          value={scopeSearch}
          onChange={e => setScopeSearch(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">{m.campaigns_form_scope_selected({ count: selected.size })}</p>
        <div className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
          {visibleTerritories.map(territory => (
            <div key={territory.id} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/40">
              <Checkbox
                id={`campaign-scope-${territory.id}`}
                name="scope"
                value={String(territory.id)}
                checked={selected.has(territory.id)}
                onCheckedChange={checked => toggle(territory.id, checked === true)}
              />
              <Label htmlFor={`campaign-scope-${territory.id}`} className="truncate font-normal text-sm">
                {territory.number}
              </Label>
            </div>
          ))}
        </div>
      </Fieldset>

      <div className="rounded-md bg-muted/50 px-4 py-3 text-sm">
        <p className="font-medium">{m.campaigns_preview_title()}</p>
        <p className="mt-1">
          <span className="text-muted-foreground">{m.campaigns_preview_start_prefix()}</span>{' '}
          {preview.start.map(key => startPreviewLabels[key]()).join(' ; ')}
        </p>
        <p>
          <span className="text-muted-foreground">{m.campaigns_preview_end_prefix()}</span>{' '}
          {preview.end.map(key => endPreviewLabels[key]()).join(' ; ')}
        </p>
      </div>
    </div>
  )
}
