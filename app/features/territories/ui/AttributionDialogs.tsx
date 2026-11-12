import { useState } from 'react'
import { useFetcher } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog'
import { DateInput } from '~/shared/ui/DateInput'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { addDays } from '~/shared/utils/calendar-day'
import { formatDay, shortDay } from '~/shared/utils/format-day'

export const PANEL_ROUTE = '/territories/attributions/panel'

/** The attribution a dialog acts on, as the list or the panel knows it. */
export interface DialogAttribution {
  id: number
  number: string
  holder: string
  /** `YYYY-MM-DD`. */
  startDay: string
  restDays: number
}

/** The refusal the panel route sent back, by field; `''` holds the form's own. */
function errorsOf(data: unknown, field: string): string[] {
  const error = (data as { error?: Record<string, string[] | null> } | undefined)?.error
  return error?.[field] ?? []
}

interface ReturnDialogProps {
  attribution: DialogAttribution | null
  today: string
  onOpenChange: (open: boolean) => void
}

/**
 * « Rentrer » records the day the territory came back: today by default, never before it went out nor after today.
 * The hint says how long it then rests, so nobody is surprised it is not offered again at once.
 */
export function ReturnAttributionDialog({ attribution, today, onOpenChange }: ReturnDialogProps) {
  return (
    <AlertDialog open={attribution != null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {attribution && (
          <ReturnForm key={attribution.id} attribution={attribution} today={today} onDone={() => onOpenChange(false)} />
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ReturnForm({
  attribution,
  today,
  onDone,
}: {
  attribution: DialogAttribution
  today: string
  onDone: () => void
}) {
  const fetcher = useFetcher()
  const [day, setDay] = useState(today)
  useCloseOnSave(fetcher, onDone)
  const fieldErrors = [...errorsOf(fetcher.data, 'end-date'), ...errorsOf(fetcher.data, '')]
  const freeDay = day !== '' ? addDays(day, attribution.restDays) : null

  return (
    <fetcher.Form method="post" action={PANEL_ROUTE} className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="return" />
      <input type="hidden" name="id" value={attribution.id} />
      <AlertDialogHeader>
        <AlertDialogTitle>{m.attributions_return_title({ number: attribution.number })}</AlertDialogTitle>
        <AlertDialogDescription>
          {m.attributions_return_body({
            name: attribution.holder,
            date: formatDay(attribution.startDay, { day: 'numeric', month: 'long' }),
          })}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="return-day">{m.attributions_return_day()}</Label>
        <DateInput
          id="return-day"
          name="end-date"
          required
          min={attribution.startDay}
          max={today}
          value={day || null}
          onChange={next => setDay(next ?? '')}
          aria-invalid={fieldErrors.length > 0 || undefined}
          className="w-60"
        />
        {fieldErrors.length > 0 ? (
          <p role="alert" className="text-danger-text text-sm">
            {fieldErrors.join(' ')}
          </p>
        ) : (
          freeDay && (
            <p className="text-faint text-xs">
              {m.attributions_return_rest_hint({ count: attribution.restDays, date: shortDay(freeDay, today) })}
            </p>
          )
        )}
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel type="button">{m.common_cancel()}</AlertDialogCancel>
        <SubmitButton disabled={fetcher.state !== 'idle'}>
          {m.attributions_return_submit({ number: attribution.number })}
        </SubmitButton>
      </AlertDialogFooter>
    </fetcher.Form>
  )
}

interface CancelDialogProps {
  attribution: Pick<DialogAttribution, 'id' | 'number' | 'holder'> | null
  onOpenChange: (open: boolean) => void
  /** After the attribution is erased: the panel that opened the dialog closes. */
  onCancelled?: () => void
}

/**
 * « Annuler l'attribution » is for a mistake: the attribution is erased, as if the territory never went out. The
 * dialog says so, and points to « Rentrer » for a territory that came back.
 */
export function CancelAttributionDialog({ attribution, onOpenChange, onCancelled }: CancelDialogProps) {
  const fetcher = useFetcher()
  useCloseOnSave(fetcher, () => {
    onOpenChange(false)
    onCancelled?.()
  })
  const errors = errorsOf(fetcher.data, '')

  return (
    <AlertDialog open={attribution != null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {attribution && (
          <fetcher.Form method="post" action={PANEL_ROUTE} className="flex flex-col gap-4">
            <input type="hidden" name="intent" value="cancel" />
            <input type="hidden" name="id" value={attribution.id} />
            <AlertDialogHeader>
              <AlertDialogTitle>{m.attributions_cancel_dialog_title({ number: attribution.number })}</AlertDialogTitle>
              <AlertDialogDescription>
                {m.attributions_cancel_dialog_body({ number: attribution.number, name: attribution.holder })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <p className="rounded-md bg-subtle px-3 py-2.5 text-muted-foreground text-sm">
              {m.attributions_cancel_dialog_hint()}
            </p>
            {errors.length > 0 && (
              <p role="alert" className="text-danger-text text-sm">
                {errors.join(' ')}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel type="button">{m.attributions_cancel_dialog_keep()}</AlertDialogCancel>
              <SubmitButton variant="destructive" disabled={fetcher.state !== 'idle'}>
                {m.attributions_cancel_dialog_confirm()}
              </SubmitButton>
            </AlertDialogFooter>
          </fetcher.Form>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
