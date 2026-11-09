import { SelectionBar } from '@unitae/ui'
import { Loader2, Send, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'

import { EventStatus } from '~/features/events/model/event-status.type'
import type { ProgrammeRowData } from '~/features/events/model/programme-list.type'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
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
import { formatEventDate } from '~/shared/utils/event-time'

type BulkResult = { ok: boolean; error?: 'invalid_payload' }

interface ProgrammeBulkActionsProps {
  selected: ProgrammeRowData[]
  onClear: () => void
  timeZone: string
}

/** A bulk route answers with flash messages; a refused shape has none, so the page says it itself. */
function useBulkFetcher(onDone: () => void) {
  const fetcher = useFetcher<BulkResult>()
  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to the request settling, onDone is fresh each render
  useEffect(() => {
    if (fetcher.state !== 'idle' || fetcher.data == null) return
    if (fetcher.data.ok) onDone()
    else if (fetcher.data.error === 'invalid_payload') toast.error(m.programs_bulk_invalid_payload())
  }, [fetcher.state, fetcher.data])
  return fetcher
}

/**
 * The actions on the selection, each shown only when the selection holds a programme it applies to and the reader may
 * do it: publish the drafts, put the published ones back to draft, delete — after a list of what goes.
 */
export function ProgrammeBulkActions({ selected, onClear, timeZone }: ProgrammeBulkActionsProps) {
  const statusFetcher = useBulkFetcher(onClear)
  const deleteFetcher = useBulkFetcher(onClear)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const toRelease = selected.filter(row => row.canPublish && row.status === EventStatus.Draft)
  const toUnrelease = selected.filter(row => row.canPublish && row.status === EventStatus.Released)
  const toDelete = selected.filter(row => row.canEdit)
  const busy = statusFetcher.state !== 'idle' || deleteFetcher.state !== 'idle'
  const submit = (fetcher: typeof statusFetcher, rows: ProgrammeRowData[], action: string) =>
    fetcher.submit({ ids: rows.map(row => row.id) }, { method: 'POST', action, encType: 'application/json' })
  const day = (row: ProgrammeRowData) =>
    formatEventDate(row.startDate, timeZone, getLocale(), { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <>
      <SelectionBar
        aria-label={m.programs_selection_toolbar()}
        label={
          selected.length > 1
            ? m.programs_selection_other({ count: selected.length })
            : m.programs_selection_one({ count: selected.length })
        }
        clearLabel={m.programs_selection_clear()}
        onClear={onClear}
        className="max-md:hidden"
      >
        {toRelease.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => submit(statusFetcher, toRelease, '/programs/bulk-release')}
          >
            {statusFetcher.state !== 'idle' ? <Loader2 className="animate-spin" /> : <Send />}
            {toRelease.length === selected.length
              ? m.programs_bulk_release_all()
              : toRelease.length > 1
                ? m.programs_bulk_release_some_other({ count: toRelease.length })
                : m.programs_bulk_release_some_one({ count: toRelease.length })}
          </Button>
        )}
        {toUnrelease.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => submit(statusFetcher, toUnrelease, '/programs/bulk-unrelease')}
          >
            <Undo2 />
            {toUnrelease.length === selected.length
              ? m.programs_bulk_unrelease_all()
              : toUnrelease.length > 1
                ? m.programs_bulk_unrelease_some_other({ count: toUnrelease.length })
                : m.programs_bulk_unrelease_some_one({ count: toUnrelease.length })}
          </Button>
        )}
        {toDelete.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 />
            {m.programs_bulk_delete_button()}
          </Button>
        )}
      </SelectionBar>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toDelete.length > 1
                ? m.programs_bulk_delete_title_other({ count: toDelete.length })
                : m.programs_bulk_delete_title_one({ count: toDelete.length })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete.length > 1 ? m.programs_bulk_delete_body_other() : m.programs_bulk_delete_body_one()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto rounded-md bg-sidebar px-3 py-2.5 text-sm">
            {toDelete.map(row => (
              <li key={row.id} className="flex justify-between gap-3">
                <span className="truncate">{row.name}</span>
                <span className="shrink-0 text-faint tabular-nums">{day(row)}</span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => {
                submit(deleteFetcher, toDelete, '/programs/bulk-delete')
                setConfirmDelete(false)
              }}
            >
              <Trash2 />
              {toDelete.length > 1
                ? m.programs_bulk_delete_submit_other({ count: toDelete.length })
                : m.programs_bulk_delete_submit_one({ count: toDelete.length })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
