import { Panel, StatusIcon } from '@unitae/ui'
import { Loader2, Pencil } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useFetcher } from 'react-router'

import {
  type AttendanceEntry,
  type AttendanceViewer,
  type CountKey,
  countField,
  entryProgress,
} from '~/features/events/model/attendance-entry'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { formatEventTime } from '~/shared/utils/event-time'
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

const label = (count: CountKey) => (count === 'inPerson' ? m.attendance_in_person() : m.attendance_online())

/**
 * The two counts of a meeting under way, from its start to midnight: the hall usher types one, the Zoom host the other,
 * each saved on its own — only the fields someone typed in are sent, so a count left alone is never cleared. Once both
 * are in, the card reads as done with the total; « Modifier » opens it again for whoever may still change a count.
 */
export function AttendanceEntryCard({ entry, viewer }: { entry: AttendanceEntry; viewer: AttendanceViewer }) {
  const fetcher = useFetcher<RecordResult>()
  const id = useId()
  const fields = { inPerson: countField(entry, 'inPerson', viewer), online: countField(entry, 'online', viewer) }
  const { entered, total } = entryProgress(entry)
  const [typed, setTyped] = useState<Partial<Record<CountKey, string>>>({})
  const [editing, setEditing] = useState(false)
  const [refusals, setRefusals] = useState<Partial<Record<CountKey, Outcome>>>({})
  const busy = fetcher.state !== 'idle'
  const anyEditable = fields.inPerson.editable || fields.online.editable
  const done = total != null && !editing

  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to the request settling only
  useEffect(() => {
    if (fetcher.state !== 'idle' || fetcher.data == null || !fetcher.data.ok) return
    const { outcomes } = fetcher.data
    setRefusals(Object.fromEntries(Object.entries(outcomes).filter(([, outcome]) => outcome !== 'saved')))
    // A saved field takes the stored value back; a refused one keeps what was typed, beside why.
    setTyped(current =>
      Object.fromEntries(Object.entries(current).filter(([count]) => outcomes[count as CountKey] !== 'saved')),
    )
    if (Object.values(outcomes).every(outcome => outcome === 'saved')) setEditing(false)
  }, [fetcher.state, fetcher.data])

  function save() {
    const counts = Object.fromEntries(
      Object.entries(typed).map(([count, text]) => [count, text.trim() === '' ? null : Number(text)]),
    )
    if (Object.keys(counts).length === 0) return
    fetcher.submit(
      { eventId: entry.eventId, ...counts },
      { method: 'POST', action: '/attendance/record', encType: 'application/json' },
    )
  }

  const time = (date: Date | string) => formatEventTime(date, viewer.timeZone, getLocale())
  const authors = COUNTS.map(count => fields[count].by).filter((name): name is string => name != null)

  return (
    <Panel aria-label={m.attendance_card_title({ name: entry.name })} className="flex flex-col">
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-3">
        {done ? (
          <StatusIcon tone="success" />
        ) : (
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-brand ring-3 ring-selected" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <h2 className="truncate font-semibold text-[15px]">{m.attendance_card_title({ name: entry.name })}</h2>
          <span className="text-faint text-xs">
            {done ? m.attendance_card_done() : m.attendance_card_live({ time: time(entry.startDate) })}
          </span>
        </div>
      </div>

      {done ? (
        <>
          <div className="flex items-baseline gap-2.5 px-4 pb-3.5 text-muted-foreground text-sm">
            <b className="font-semibold text-2xl text-foreground tabular-nums">{total}</b>
            <span>{m.attendance_done_split({ inPerson: String(entry.inPerson), online: String(entry.online) })}</span>
          </div>
          <div className="flex items-center gap-2 border-border border-t px-4 py-2.5">
            <span className="flex-1 truncate text-faint text-xs">
              {new Intl.ListFormat(getLocale(), { type: 'conjunction' }).format([...new Set(authors)])}
            </span>
            {anyEditable && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <Pencil />
                {m.attendance_edit()}
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 px-4 pb-3.5">
            {COUNTS.map(count => {
              const field = fields[count]
              const refusal = refusals[count]
              return (
                <div key={count} className="flex min-w-0 flex-col gap-1.5">
                  <label htmlFor={`${id}-${count}`} className="font-medium text-sm">
                    {label(count)}
                  </label>
                  <Input
                    id={`${id}-${count}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="—"
                    readOnly={!field.editable}
                    aria-invalid={refusal != null}
                    aria-describedby={`${id}-${count}-note`}
                    value={typed[count] ?? (field.value == null ? '' : String(field.value))}
                    onChange={event => setTyped(current => ({ ...current, [count]: event.target.value }))}
                    className={cn(
                      'h-12 text-center font-medium text-xl tabular-nums md:text-xl pointer-coarse:h-14 pointer-coarse:text-2xl',
                      !field.editable && 'bg-subtle',
                    )}
                  />
                  <span id={`${id}-${count}-note`} className="min-h-4 text-faint text-xs" aria-live="polite">
                    {refusal != null && refusal !== 'saved' ? (
                      <span className="text-danger-text">{REFUSAL[refusal]()}</span>
                    ) : field.at != null ? (
                      field.mine ? (
                        m.attendance_saved_by_you({ time: time(field.at) })
                      ) : (
                        m.attendance_saved_by({ name: field.by ?? m.attendance_someone(), time: time(field.at) })
                      )
                    ) : (
                      m.attendance_waiting()
                    )}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-2 border-border border-t px-4 py-2.5">
            <span className="flex-1 text-faint text-xs">
              {entered === 0 ? m.attendance_nothing() : m.attendance_partial({ count: String(entered) })}
            </span>
            {editing && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>
                {m.common_cancel()}
              </Button>
            )}
            {anyEditable && (
              <Button
                size="sm"
                className="pointer-coarse:h-11 max-md:flex-1"
                disabled={busy || Object.keys(typed).length === 0}
                onClick={save}
              >
                {busy && <Loader2 className="animate-spin" />}
                {m.attendance_save()}
              </Button>
            )}
          </div>
        </>
      )}
    </Panel>
  )
}
