import { Clock, Loader2 } from 'lucide-react'
import { type ReactNode, useEffect, useId, useState } from 'react'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'

import {
  type AttendanceEntry,
  type AttendanceViewer,
  type CountKey,
  countField,
  countsToSend,
} from '~/features/events/model/attendance-entry'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { formatEventDate, formatEventTime } from '~/shared/utils/event-time'
import { cn } from '~/shared/utils/utils'

type Outcome = 'saved' | 'taken' | 'refused' | 'invalid' | 'missing'
type RecordResult = { ok: true; outcomes: Partial<Record<CountKey, Outcome>> } | { ok: false }

const COUNTS: CountKey[] = ['inPerson', 'online']

const REFUSAL: Record<Exclude<Outcome, 'saved'>, () => string> = {
  taken: () => m.attendance_error_taken(),
  refused: () => m.attendance_error_refused(),
  invalid: () => m.attendance_error_invalid(),
  missing: () => m.attendance_error_missing(),
}

const LABEL = { inPerson: () => m.attendance_in_person(), online: () => m.attendance_online_long() }
const HISTORY = { inPerson: () => m.attendance_history_in_person(), online: () => m.attendance_history_online() }

/**
 * One meeting's counts in the attendance page's side panel: the two numbers, the total as typed, who entered each
 * and when. Whoever may change a count (a corrector, or a recorder on today's meeting) changes it here, through the
 * same writer as the dashboard card — only the fields typed in, each on its own. Key it by the meeting.
 */
export function AttendancePanel({
  entry,
  viewer,
  frame,
  formRef,
}: {
  entry: AttendanceEntry
  viewer: AttendanceViewer
  /** Places the fields and « Enregistrer » — the side panel pins the button in its footer. */
  frame: (body: ReactNode, footer: ReactNode) => ReactNode
  /** The side editor's change counter: moving to another meeting asks before typed numbers are dropped. */
  formRef?: (form: HTMLFormElement | null) => void
}) {
  const fetcher = useFetcher<RecordResult>()
  const id = useId()
  const fields = { inPerson: countField(entry, 'inPerson', viewer), online: countField(entry, 'online', viewer) }
  const [typed, setTyped] = useState<Partial<Record<CountKey, string>>>({})
  // A new starting point for the change counter once a count is saved: what is saved is no longer a change.
  const [version, setVersion] = useState(0)
  const [refusals, setRefusals] = useState<Partial<Record<CountKey, Exclude<Outcome, 'saved'>>>>({})
  const busy = fetcher.state !== 'idle'
  const anyEditable = fields.inPerson.editable || fields.online.editable
  const locale = getLocale()

  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to the request settling only
  useEffect(() => {
    if (fetcher.state !== 'idle' || fetcher.data == null) return
    if (!fetcher.data.ok) {
      toast.error(m.attendance_error_failed())
      return
    }
    const { outcomes } = fetcher.data
    const refused = Object.entries(outcomes).filter(([, outcome]) => outcome !== 'saved') as [
      CountKey,
      Exclude<Outcome, 'saved'>,
    ][]
    setRefusals(current => ({
      ...Object.fromEntries(Object.entries(current).filter(([count]) => !(count in outcomes))),
      ...Object.fromEntries(refused),
    }))
    setTyped(current =>
      Object.fromEntries(Object.entries(current).filter(([count]) => outcomes[count as CountKey] !== 'saved')),
    )
    if (Object.values(outcomes).includes('saved')) setVersion(current => current + 1)
    for (const [count, outcome] of refused) toast.error(`${LABEL[count]()} : ${REFUSAL[outcome]()}`)
  }, [fetcher.state, fetcher.data])

  function save() {
    const { counts, invalid } = countsToSend(typed, fields)
    setRefusals(Object.fromEntries(invalid.map(count => [count, 'invalid'])))
    if (Object.keys(counts).length === 0) return
    fetcher.submit(
      { eventId: entry.eventId, ...counts },
      { method: 'POST', action: '/attendance/record', encType: 'application/json' },
    )
  }

  // What the fields show: typed while editable, else what is stored.
  const shown = (count: CountKey) =>
    (fields[count].editable ? typed[count] : undefined) ??
    (fields[count].value == null ? '' : String(fields[count].value))
  const asNumber = (text: string) => (text.trim() === '' ? null : Number(text))
  const inPerson = asNumber(shown('inPerson'))
  const online = asNumber(shown('online'))
  const total =
    inPerson != null && online != null && Number.isFinite(inPerson) && Number.isFinite(online)
      ? inPerson + online
      : null

  const body = (
    <form
      key={version}
      ref={formRef}
      onSubmit={event => {
        event.preventDefault()
        save()
      }}
      className="flex flex-col gap-3.5"
    >
      <div className="grid grid-cols-2 gap-2.5">
        {COUNTS.map(count => {
          const field = fields[count]
          const refusal = refusals[count]
          return (
            <div key={count} className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={`${id}-${count}`} className="font-medium text-sm">
                {LABEL[count]()}
              </label>
              <Input
                id={`${id}-${count}`}
                name={count}
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="—"
                readOnly={!field.editable}
                aria-invalid={refusal != null}
                aria-describedby={refusal != null ? `${id}-${count}-refusal` : undefined}
                value={shown(count)}
                onChange={event => setTyped(current => ({ ...current, [count]: event.target.value }))}
                className={cn('h-12 font-medium text-xl tabular-nums md:text-xl', !field.editable && 'bg-subtle')}
              />
              {refusal != null && (field.editable || field.at == null) && (
                <span id={`${id}-${count}-refusal`} className="text-danger-text text-xs" aria-live="polite">
                  {REFUSAL[refusal]()}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <span className="text-faint text-xs">{m.attendance_online_help()}</span>
      <div className="flex items-baseline justify-between rounded-md bg-subtle px-3 py-2.5 text-sm" aria-live="polite">
        <span>{m.attendance_total_label()}</span>
        <b className="font-semibold text-xl tabular-nums">{total ?? '—'}</b>
      </div>
      {total == null && <span className="text-faint text-xs">{m.attendance_partial_help()}</span>}
      <ul className="flex flex-col gap-1.5 text-faint text-xs">
        {COUNTS.map(count => {
          const field = fields[count]
          // A count without a recorded author (imported from an archive) has no line: it was entered, by someone.
          if (field.at == null && field.value != null) return null
          const who = field.mine ? m.attendance_you() : (field.by ?? m.attendance_someone())
          const stamp =
            field.at == null
              ? null
              : {
                  count: HISTORY[count](),
                  name: who,
                  date: formatEventDate(field.at, viewer.timeZone, locale, { day: 'numeric', month: 'short' }),
                  time: formatEventTime(field.at, viewer.timeZone, locale),
                }
          return (
            <li key={count} className="flex items-center gap-1.5">
              <Clock aria-hidden="true" className="size-3.5 shrink-0" />
              {stamp == null
                ? m.attendance_history_never({ count: HISTORY[count]() })
                : field.value == null
                  ? // Cleared: the writer keeps who did it and when.
                    m.attendance_history_cleared(stamp)
                  : m.attendance_history(stamp)}
            </li>
          )
        })}
      </ul>
    </form>
  )
  const footer = anyEditable ? (
    <Button disabled={busy || Object.keys(typed).length === 0} onClick={save}>
      {busy && <Loader2 className="animate-spin" />}
      {m.attendance_save()}
    </Button>
  ) : null
  return frame(body, footer)
}
