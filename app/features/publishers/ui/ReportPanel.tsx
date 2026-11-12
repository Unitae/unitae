import { SidePanel } from '@unitae/ui'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { type ReactNode, type Ref, useEffect, useRef, useState } from 'react'
import { useFetcher } from 'react-router'

import type { ReportPanelData } from '~/features/publishers/model/report-panel.type'
import * as m from '~/i18n/paraglide/messages'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'
import { Skeleton } from '~/shared/ui/skeleton'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'

import { ReportForm } from './ReportForm'
import { formatMonthYear } from './report-month-format'

const FORM_ID = 'report-form'
const REPORT_ROUTE = '/publishers/activity/report'

/** The month the panel opens, and the button that opened it: focus goes back there on close. */
export interface ReportTarget {
  publisherId: number
  month: number
  year: number
  trigger: HTMLElement | null
}

/** The missing reports around the open one, so « Enregistrer et suivant » can walk them. */
export interface ReportQueue {
  /** 1-based place of the open report among the missing ones. */
  position: number
  total: number
  onPrevious: () => void
  onNext: () => void
}

type LoadResult = ({ ok: true } & ReportPanelData) | { ok: false; reason: string }

interface ReportPanelProps {
  target: ReportTarget
  /** Docked beside the list from 1280 px; a sheet over the page below. */
  docked: boolean
  /** Counts the docked form's changes, so switching rows asks before dropping them. */
  formRef?: Ref<HTMLFormElement>
  /** × and Escape: the host asks first while the docked form holds changes. */
  onRequestClose: () => void
  /** Closes without asking: « Annuler », a save, a delete. */
  onClose: () => void
  /** After a save: the host opens the next missing report when asked, and closes otherwise. */
  onSaved: (next: boolean) => void
  queue: ReportQueue | null
  className?: string
}

/**
 * One publisher's monthly report, beside the list or over it: loaded from the report route, saved back to it. The
 * activity page and the group page both open it; the route decides what the reader may do with the month.
 */
export function ReportPanel({
  target,
  docked,
  formRef,
  onRequestClose,
  onClose,
  onSaved,
  queue,
  className,
}: ReportPanelProps) {
  const loader = useFetcher<LoadResult>()
  const saver = useFetcher()
  const deleter = useFetcher()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const next = useRef(false)
  const query = `publisherId=${target.publisherId}&month=${target.month}&year=${target.year}`

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetcher.load is stable, adding it causes infinite loop
  useEffect(() => {
    loader.load(`${REPORT_ROUTE}?${query}`)
  }, [query])

  useSettled(saver, () => onSaved(next.current))
  useSettled(deleter, onClose)

  const data = loader.data?.ok ? loader.data : null
  const failed = loader.data != null && !loader.data.ok
  const title = data ? formatPersonName(data.publisher) : m.report_panel_loading_title()
  const monthLabel = formatMonthYear(target.month, target.year)
  const description = panelDescription(data, monthLabel)
  const busy = saver.state !== 'idle' || deleter.state !== 'idle'

  const body = (
    <PanelBody failed={failed}>
      {data && (
        <ReportForm key={data.report?.id ?? 'new'} data={data} fetcher={saver} formId={FORM_ID} formRef={formRef} />
      )}
    </PanelBody>
  )

  // The walk through the missing reports: in the docked panel's header, in the sheet's footer.
  const walkable = data != null && data.report == null && queue != null && queue.total > 1 ? queue : null

  const footer = data && (
    <ReportFooter
      filed={data.report != null}
      canDelete={data.canDelete}
      busy={busy}
      queue={docked ? null : walkable}
      onDelete={() => setConfirmDelete(true)}
      onSave={andNext => {
        next.current = andNext
      }}
    />
  )

  const dialog = data && (
    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.report_panel_delete_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {m.report_panel_delete_description({ name: title, month: monthLabel })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              deleter.submit(
                { intent: 'delete', publisherId: target.publisherId, month: target.month, year: target.year },
                { method: 'post', action: REPORT_ROUTE },
              )
            }
          >
            {m.activity_delete_button()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  if (docked) {
    return (
      <SidePanel
        title={title}
        description={description}
        closeLabel={m.common_close()}
        onClose={onRequestClose}
        returnFocus={target.trigger}
        footer={footer}
        walk={
          walkable == null
            ? undefined
            : {
                position: m.report_panel_missing_position({ position: walkable.position, total: walkable.total }),
                previousLabel: m.report_panel_previous_missing(),
                nextLabel: m.report_panel_next_missing(),
                onPrevious: walkable.onPrevious,
                onNext: walkable.onNext,
              }
        }
        className={className}
      >
        {body}
        {dialog}
      </SidePanel>
    )
  }

  return (
    <Sheet open onOpenChange={open => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">{body}</div>
        {footer && (
          <SheetFooter className="flex-row flex-wrap items-center border-border border-t">{footer}</SheetFooter>
        )}
        {dialog}
      </SheetContent>
    </Sheet>
  )
}

/** « Nouveau rapport · octobre 2026 · Groupe Sud », or the month alone while it loads. */
function panelDescription(data: ReportPanelData | null, monthLabel: string) {
  if (data == null) return monthLabel
  const title = data.report
    ? m.report_panel_title_filed({ month: monthLabel })
    : m.report_panel_title_new({ month: monthLabel })
  return data.publisher.groupName ? `${title} · ${formatGroupName(data.publisher.groupName)}` : title
}

/** The form once loaded; a placeholder before, a message when the month cannot be opened. */
function PanelBody({ failed, children }: { failed: boolean; children: ReactNode }) {
  if (failed) return <p className="text-muted-foreground text-sm">{m.report_panel_unavailable()}</p>
  if (children) return children
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  )
}

/** Calls `onDone` once the fetcher's submission comes back `{ ok: true }`. */
function useSettled(fetcher: ReturnType<typeof useFetcher>, onDone: () => void) {
  const previous = useRef(fetcher.state)
  const latest = useRef(onDone)
  latest.current = onDone
  useEffect(() => {
    const ok = (fetcher.data as { ok?: boolean } | undefined)?.ok
    if (previous.current !== 'idle' && fetcher.state === 'idle' && ok) latest.current()
    previous.current = fetcher.state
  }, [fetcher.state, fetcher.data])
}

interface ReportFooterProps {
  filed: boolean
  canDelete: boolean
  busy: boolean
  queue: ReportQueue | null
  onDelete: () => void
  onSave: (andNext: boolean) => void
}

/**
 * A filed report: delete (for the secretary) and save. A missing one: the place among the missing reports, save, and
 * « Enregistrer et suivant » to the next one while there is one.
 */
function ReportFooter({ filed, canDelete, busy, queue, onDelete, onSave }: ReportFooterProps): ReactNode {
  const walk = !filed && queue != null && queue.total > 1

  return (
    <div className="flex w-full flex-col gap-2">
      {walk && (
        <span className="flex items-center gap-1 text-faint text-xs">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.report_panel_previous_missing()}
            onClick={queue.onPrevious}
          >
            <ChevronLeft />
          </Button>
          <span className="tabular-nums">
            {m.report_panel_missing_position({ position: queue.position, total: queue.total })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.report_panel_next_missing()}
            onClick={queue.onNext}
          >
            <ChevronRight />
          </Button>
        </span>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {filed && !canDelete && (
          <span className="mr-auto text-faint text-xs">{m.report_panel_delete_by_secretary()}</span>
        )}
        {filed && canDelete && (
          <Button type="button" variant="ghost" className="mr-auto text-danger-text" onClick={onDelete} disabled={busy}>
            <Trash2 />
            {m.report_panel_delete()}
          </Button>
        )}
        <SubmitButton
          form={FORM_ID}
          variant={walk ? 'outline' : 'default'}
          disabled={busy}
          onClick={() => onSave(false)}
        >
          {m.common_save()}
        </SubmitButton>
        {walk && (
          <SubmitButton form={FORM_ID} disabled={busy} onClick={() => onSave(true)}>
            {m.report_panel_save_next()}
          </SubmitButton>
        )}
      </div>
    </div>
  )
}
