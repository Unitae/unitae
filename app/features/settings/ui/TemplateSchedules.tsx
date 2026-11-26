import { Callout, Panel } from '@unitae/ui'
import { ChevronDown, ChevronRight, ChevronUp, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import type { ScheduleTemplateView } from '~/features/settings/model/schedule-template-view'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/shared/ui/dialog'

export type TemplateScheduleRow = Pick<ScheduleTemplateView, 'id' | 'title' | 'detail' | 'responsible'> &
  // The types using it, for a template it may come to use: unnamed templates all read « Services ».
  Partial<Pick<ScheduleTemplateView, 'suggestedBy'>>

const rowLine = (row: TemplateScheduleRow) =>
  [row.detail, row.responsible ?? m.settings_schedule_templates_responsible_none(), row.suggestedBy]
    .filter(Boolean)
    .join(' · ')

/**
 * The schedule templates a meeting type uses (« TourA-Reglages-Types »'s « Plannings »), in their order: each opens in
 * « Modèles de planning », where its parts or services are set. A manager adds one (« Utiliser un modèle », one of each
 * sort: a new meeting copies the first of each), removes one and moves it up or down (6b-2).
 */
export function TemplateSchedules({
  rows,
  candidates,
  editable,
}: {
  rows: TemplateScheduleRow[]
  /** The templates it may come to use: of a sort it uses none of. Null when it uses one of each. */
  candidates: TemplateScheduleRow[] | null
  editable: boolean
}) {
  const fetcher = useFetcher<{ status?: string; error?: Record<string, string[]> }>()
  const [picking, setPicking] = useState(false)
  const busy = fetcher.state !== 'idle'
  const refusal = fetcher.state === 'idle' ? fetcher.data?.error?.['']?.join(' ') : undefined
  // The button pressed is gone or drawn again once the answer is back: focus goes to the list, not the page's body.
  const list = useRef<HTMLDivElement>(null)
  const refocus = useRef(false)
  useEffect(() => {
    if (fetcher.state !== 'idle' || !refocus.current) return
    refocus.current = false
    list.current?.focus()
  }, [fetcher.state])
  const submit = (intent: string, ids: number[]) => {
    refocus.current = intent !== 'use-schedule-template'
    const form = new FormData()
    form.set('intent', intent)
    for (const id of ids) form.append('scheduleTemplateId', String(id))
    fetcher.submit(form, { method: 'post' })
  }
  const move = (from: number, to: number) => {
    const ids = rows.map(row => row.id)
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    submit('order-schedule-templates', ids)
  }

  return (
    <Panel title={m.settings_template_schedules_title()} padded>
      <div className="flex flex-col gap-3">
        <p className="text-faint text-xs">{m.settings_template_schedules_hint()}</p>
        {refusal && <Callout tone="danger" role="alert" title={refusal} />}
        <div ref={list} tabIndex={-1} className="outline-none">
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{m.settings_template_schedules_empty()}</p>
          ) : (
            <ul className="flex flex-col rounded-md border border-border">
              {rows.map((row, index) => (
                <li key={row.id} className="flex items-center gap-1 border-border border-b pr-1.5 last:border-b-0">
                  <Link
                    to={`/settings/schedule-templates?template=${row.id}`}
                    data-schedule-template-id={row.id}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors duration-(--u-duration-fast) hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">{row.title}</span>
                      <span className="text-faint text-xs">{rowLine(row)}</span>
                    </span>
                    {!editable && <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-faint" />}
                  </Link>
                  {editable && (
                    <>
                      {rows.length > 1 && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={busy || index === 0}
                            aria-label={m.settings_template_schedules_up({ name: row.title })}
                            onClick={() => move(index, index - 1)}
                          >
                            <ChevronUp />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={busy || index === rows.length - 1}
                            aria-label={m.settings_template_schedules_down({ name: row.title })}
                            onClick={() => move(index, index + 1)}
                          >
                            <ChevronDown />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        aria-label={m.settings_template_schedules_remove({ name: row.title })}
                        onClick={() => submit('stop-schedule-template', [row.id])}
                      >
                        <X />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {editable && candidates != null && (
          <Button variant="ghost" size="sm" className="self-start" disabled={busy} onClick={() => setPicking(true)}>
            <Plus />
            {m.settings_template_schedules_use()}
          </Button>
        )}
      </div>
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{m.settings_template_schedules_use_title()}</DialogTitle>
            <DialogDescription>{m.settings_template_schedules_use_hint()}</DialogDescription>
          </DialogHeader>
          {candidates == null || candidates.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-muted-foreground text-sm">{m.settings_template_schedules_use_empty()}</p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/settings/schedule-templates">{m.settings_template_schedules_use_open()}</Link>
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col rounded-md border border-border">
              {candidates.map(row => (
                <li key={row.id} className="border-border border-b last:border-b-0">
                  <button
                    type="button"
                    data-schedule-template-id={row.id}
                    disabled={busy}
                    onClick={() => {
                      submit('use-schedule-template', [row.id])
                      setPicking(false)
                    }}
                    className="flex min-h-11 w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left text-sm outline-none transition-colors duration-(--u-duration-fast) hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="font-medium">{row.title}</span>
                    <span className="text-faint text-xs">{rowLine(row)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </Panel>
  )
}
