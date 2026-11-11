import { Tag } from '@unitae/ui'
import { FileText, Upload, X } from 'lucide-react'
import { type DragEvent, useEffect, useRef, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { formatSpeakerDate } from '~/features/events/model/speaker-dates'
import type { SpeakerCongregationContacts } from '~/features/events/model/speaker-list.type'
import type { CurrentListSpeaker, ElsewhereSpeaker } from '~/features/events/model/speaker-list-diff'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageTopbar } from '~/shared/ui/PageTopbar'
import { cn } from '~/shared/utils/utils'
import { SpeakerListRowsTable } from './SpeakerListRowsTable'
import { useSpeakerListUpdate } from './use-speaker-list-update'

// « Mettre à jour la liste »: the received PDF is read and compared with the list we have; it stays open beside the
// rows so each one can be checked; nothing is saved before « Enregistrer », and the save bar only appears once
// something changed. Desktop and tablet: the rows are too wide for a phone.

export interface SpeakerListUpdatePage {
  congregation: SpeakerCongregationContacts & {
    id: number
    name: string
    listDate: Date | null
    listFileName: string | null
  }
  current: CurrentListSpeaker[]
  elsewhere: ElsewhereSpeaker[]
  timezone: string
}

const CONTACT_PARTS = [
  { part: 'Name', name: m.external_speakers_update_col_name },
  { part: 'Phone', name: m.external_speakers_field_phone },
  { part: 'Email', name: m.external_speakers_field_email },
] as const

const CONTACT_ROWS = [
  { prefix: 'responsible', label: m.external_speakers_responsible },
  { prefix: 'coordinator', label: m.external_speakers_coordinator },
] as const

function one(count: number, single: () => string, many: (p: { count: string }) => string) {
  return count === 1 ? single() : many({ count: String(count) })
}

export function SpeakerListUpdateScreen({ page }: { page: SpeakerListUpdatePage }) {
  const { congregation, current, elsewhere, timezone } = page
  const state = useSpeakerListUpdate({ current, elsewhere, contacts: congregation, listDate: congregation.listDate })
  const fetcher = useFetcher<{ ok: false; error: string }>()
  const input = useRef<HTMLInputElement>(null)
  const [showPdf, setShowPdf] = useState(true)
  const [fileUrl, setFileUrl] = useState<string | null>(null)

  useEffect(() => {
    if (state.file == null) return setFileUrl(null)
    const url = URL.createObjectURL(state.file)
    setFileUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [state.file])

  const choose = (file: File | undefined) => {
    if (file) void state.importPdf(file)
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    choose(event.dataTransfer.files[0])
  }

  const save = () => {
    const body = new FormData()
    body.set('payload', JSON.stringify({ listDate: state.listDate, contacts: state.contacts, rows: state.changes }))
    if (state.file) body.set('file', state.file)
    fetcher.submit(body, { method: 'post', encType: 'multipart/form-data' })
  }

  const { counts } = state
  const summary = [
    counts.created > 0 &&
      one(counts.created, () => m.external_speakers_update_new_one(), m.external_speakers_update_new_many),
    counts.updated > 0 &&
      one(counts.updated, () => m.external_speakers_update_changed_one(), m.external_speakers_update_changed_many),
    counts.moved > 0 &&
      one(counts.moved, () => m.external_speakers_update_moved_one(), m.external_speakers_update_moved_many),
    counts.retired > 0 &&
      one(counts.retired, () => m.external_speakers_update_retired_one(), m.external_speakers_update_retired_many),
    counts.unanswered > 0 &&
      one(counts.unanswered, () => m.external_speakers_update_ask_one(), m.external_speakers_update_ask_many),
    state.contactsChanged && m.external_speakers_update_count_contacts(),
  ].filter((part): part is string => typeof part === 'string')
  const pdfShown = fileUrl != null && showPdf
  const refusal = fetcher.state === 'idle' && fetcher.data?.ok === false ? fetcher.data.error : null
  const saveLabel = state.listDate
    ? m.external_speakers_update_save({
        date: formatSpeakerDate(new Date(`${state.listDate}T12:00:00.000Z`), timezone),
      })
    : m.external_speakers_update_save_undated()

  return (
    <div className="flex min-h-full flex-col gap-5">
      <PageTopbar
        trail={[
          { label: m.external_speakers_page_title(), to: '/programs/external-speakers' },
          { label: congregation.name, to: `/programs/external-speakers?congregation=${congregation.id}` },
          { label: m.external_speakers_update_list() },
        ]}
        className="mb-0"
        actions={
          fileUrl != null && (
            <Button variant="ghost" size="sm" onClick={() => setShowPdf(shown => !shown)} className="max-lg:hidden">
              <FileText aria-hidden="true" />
              {showPdf ? m.external_speakers_update_hide_pdf() : m.external_speakers_update_show_pdf()}
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              {m.external_speakers_update_title({ name: congregation.name })}
            </h1>
            {congregation.listDate && (
              <span className="text-faint tabular-nums">
                {m.external_speakers_update_current({ date: formatSpeakerDate(congregation.listDate, timezone) })}
              </span>
            )}
          </div>
          <p className="text-muted-foreground max-w-3xl text-sm">
            {m.external_speakers_update_intro({ name: congregation.name })}
          </p>
        </div>
      </PageTopbar>

      <p className="text-muted-foreground text-sm md:hidden">
        {m.external_speakers_update_list_desktop()}{' '}
        <Link to="/programs/external-speakers" className="text-primary hover:underline">
          {m.external_speakers_update_back()}
        </Link>
      </p>

      <div className={cn('flex items-start gap-5 max-md:hidden')}>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {state.file == null ? (
            <>
              <button
                type="button"
                onClick={() => input.current?.click()}
                onDragOver={event => event.preventDefault()}
                onDrop={onDrop}
                className="border-border bg-card hover:border-primary flex items-center gap-4 rounded-lg border-[1.5px] border-dashed px-5 py-4 text-left transition-colors"
              >
                <span className="bg-selected text-brand-text grid size-10 flex-none place-content-center rounded-md">
                  <Upload aria-hidden="true" className="size-5" />
                </span>
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="font-medium">{m.external_speakers_update_drop_title()}</span>
                  <span className="text-muted-foreground text-sm">{m.external_speakers_update_drop_body()}</span>
                </span>
                <span className="border-border rounded-md border px-3 py-1.5 text-sm font-medium">
                  {m.external_speakers_update_choose_file()}
                </span>
              </button>
              <input
                ref={input}
                type="file"
                accept="application/pdf"
                className="sr-only"
                tabIndex={-1}
                aria-label={m.external_speakers_update_choose_file()}
                onChange={event => choose(event.target.files?.[0])}
              />
              <p className="text-faint -mt-2 text-sm">{m.external_speakers_update_no_pdf()}</p>
            </>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex w-44 flex-col gap-1.5">
                <Label htmlFor="list-date">{m.external_speakers_update_list_date()}</Label>
                <Input
                  id="list-date"
                  type="date"
                  value={state.listDate}
                  onChange={event => state.setListDate(event.target.value)}
                />
              </div>
              <p className="text-muted-foreground pb-2 text-sm" aria-live="polite">
                {state.read.kind === 'reading' && m.external_speakers_update_reading()}
                {state.read.kind === 'read' &&
                  (state.read.count === 1
                    ? m.external_speakers_update_read_one({ file: state.file.name })
                    : m.external_speakers_update_read_many({ file: state.file.name, count: String(state.read.count) }))}
              </p>
            </div>
          )}
          {state.read.kind === 'scanned' && (
            <p className="bg-warning-soft rounded-md px-3 py-2.5 text-sm">{m.external_speakers_update_scanned()}</p>
          )}
          {state.read.kind === 'error' && (
            <p className="bg-danger-soft text-danger-text rounded-md px-3 py-2.5 text-sm">
              {m.external_speakers_update_unreadable()}
            </p>
          )}

          <section
            aria-label={m.external_speakers_update_contacts()}
            className="border-border bg-card rounded-lg border"
          >
            <div className="text-faint border-border grid grid-cols-[180px_1fr_0.8fr_1.2fr_88px] items-center gap-2 border-b px-3 py-2.5 text-sm font-medium">
              <h2 className="font-medium">{m.external_speakers_update_contacts()}</h2>
              <span>{m.external_speakers_update_col_name()}</span>
              <span>{m.external_speakers_field_phone()}</span>
              <span>{m.external_speakers_field_email()}</span>
              <span>{m.external_speakers_update_col_state()}</span>
            </div>
            <div className="flex flex-col gap-2 p-3">
              {CONTACT_ROWS.map(({ prefix, label }) => {
                const contactState = state.contactState(prefix)
                return (
                  <div key={prefix} className="grid grid-cols-[180px_1fr_0.8fr_1.2fr_88px] items-center gap-2 text-sm">
                    <span>{label()}</span>
                    {CONTACT_PARTS.map(({ part, name }) => {
                      const key = `${prefix}${part}` as keyof SpeakerCongregationContacts
                      return (
                        <Input
                          key={key}
                          value={state.contacts[key]}
                          onChange={event => state.setContact(key, event.target.value)}
                          aria-label={`${label()} · ${name()}`}
                          className="h-8"
                        />
                      )
                    })}
                    <span>
                      {contactState === 'added' && <Tag tone="brand">{m.external_speakers_update_tag_added()}</Tag>}
                      {contactState === 'changed' && <Tag>{m.external_speakers_update_tag_changed()}</Tag>}
                      {contactState === 'unchanged' && <Tag>{m.external_speakers_update_tag_unchanged()}</Tag>}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>

          <SpeakerListRowsTable state={state} />
          <p className="text-faint max-w-3xl text-sm">{m.external_speakers_update_why()}</p>
        </div>

        {pdfShown && (
          <aside
            aria-label={m.external_speakers_update_pdf_label()}
            className="border-border bg-card sticky top-4 flex w-[380px] flex-none flex-col overflow-hidden rounded-lg border max-lg:hidden"
          >
            <div className="border-border flex items-center gap-2 border-b px-3 py-2 text-sm">
              <FileText aria-hidden="true" className="text-faint size-4" />
              <span className="min-w-0 flex-1 truncate">{state.file?.name}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={m.external_speakers_update_hide_pdf()}
                onClick={() => setShowPdf(false)}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            <iframe title={state.file?.name ?? ''} src={fileUrl ?? undefined} className="h-[70vh] w-full bg-white" />
            <p className="text-faint border-border border-t px-3 py-2 text-xs">
              {m.external_speakers_update_pdf_kept({ name: congregation.name })}
            </p>
          </aside>
        )}
      </div>

      {state.dirty && (
        <div className="border-border bg-surface sticky bottom-0 -mx-4 mt-auto flex items-center gap-3 border-t px-4 py-3 max-md:hidden sm:-mx-6 sm:px-6">
          <span className="text-muted-foreground min-w-0 flex-1 text-sm" aria-live="polite">
            {refusal ??
              (counts.unanswered > 0
                ? `${summary.join(' · ')} — ${m.external_speakers_update_answer_first()}`
                : summary.join(' · '))}
          </span>
          <Button type="button" variant="ghost" onClick={state.reset}>
            {m.external_speakers_update_reset()}
          </Button>
          <Button type="button" onClick={save} disabled={counts.unanswered > 0 || fetcher.state !== 'idle'}>
            {saveLabel}
          </Button>
        </div>
      )}
    </div>
  )
}
