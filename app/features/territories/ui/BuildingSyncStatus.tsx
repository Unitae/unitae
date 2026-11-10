import { ProgressBar } from '@unitae/ui'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { Form, useRevalidator } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { shortDay } from '~/shared/utils/format-day'
import { cn } from '~/shared/utils/utils'
import type { BuildingView } from '../model/building-list'
import { buildingSyncErrorLabel } from '../model/building-sync-error-label'

/** A run as the page receives it: the day it started instead of the instant. */
export interface SyncRunView {
  status: 'Running' | 'Completed' | 'Failed'
  progress: number
  startedDay: string
  createdCount: number | null
  missingCount: number | null
  error: string | null
  startedBy: string | null
}

// How often the page asks again while a sync runs: the worker writes its progress every few points.
const POLL_MS = 4_000

/** Reloads the page's data every few seconds while a sync is running, and stops once it ends. */
export function useSyncPolling(running: boolean) {
  const revalidator = useRevalidator()
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      if (revalidator.state === 'idle') revalidator.revalidate()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [running, revalidator])
}

interface BuildingSyncStatusProps {
  run: SyncRunView | null
  today: string
  canSync: boolean
  onView: (view: BuildingView) => void
}

/**
 * The line under the title: when the BANO was last read and what it changed, with links to the new and missing
 * buildings; the progress while it runs; why it failed, with « Réessayer »; or that it never ran.
 */
export function BuildingSyncStatus({ run, today, canSync, onView }: BuildingSyncStatusProps) {
  useSyncPolling(run?.status === 'Running')
  const line = 'flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-sm'
  const icon = 'size-4 shrink-0 text-faint'

  if (run == null) {
    return (
      <p className={line}>
        <RefreshCw className={icon} aria-hidden="true" />
        {m.prospection_sync_status_never()}
      </p>
    )
  }

  if (run.status === 'Running') {
    const percent = new Intl.NumberFormat(getLocale(), { style: 'percent' }).format(run.progress / 100)
    return (
      <p className={line} role="status">
        <RefreshCw className={cn(icon, 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
        <span>{m.prospection_sync_status_running()}</span>
        <ProgressBar value={run.progress} max={100} size="sm" className="w-28" />
        <span className="tabular-nums">{percent}</span>
        <span className="text-faint">·</span>
        <span>{m.prospection_sync_status_running_hint()}</span>
      </p>
    )
  }

  if (run.status === 'Failed') {
    return (
      <div className={line} role="alert">
        <AlertTriangle className="size-4 shrink-0 text-warning-text" aria-hidden="true" />
        <span>
          {m.prospection_sync_status_failed({ date: shortDay(run.startedDay, today) })}{' '}
          {buildingSyncErrorLabel(run.error)} {m.prospection_sync_status_failed_kept()}
        </span>
        {canSync && (
          <Form method="post" action="/territories/buildings/sync">
            <Button type="submit" variant="link" size="sm" className="h-auto p-0">
              {m.prospection_sync_retry()}
            </Button>
          </Form>
        )}
      </div>
    )
  }

  const date = shortDay(run.startedDay, today)
  return (
    <p className={line}>
      <RefreshCw className={icon} aria-hidden="true" />
      <span>
        {run.startedBy
          ? m.prospection_sync_status_done({ date, name: run.startedBy })
          : m.prospection_sync_status_done_anonymous({ date })}
      </span>
      {run.createdCount != null && (
        <>
          <span className="text-faint">·</span>
          <ViewLink onClick={() => onView('new')}>
            {run.createdCount === 1
              ? m.prospection_sync_new_link_one()
              : m.prospection_sync_new_link({ count: run.createdCount })}
          </ViewLink>
        </>
      )}
      {run.missingCount != null && (
        <>
          <span className="text-faint">·</span>
          <ViewLink onClick={() => onView('missing')}>
            {run.missingCount === 1
              ? m.prospection_sync_missing_link_one()
              : m.prospection_sync_missing_link({ count: run.missingCount })}
          </ViewLink>
        </>
      )}
    </p>
  )
}

function ViewLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-foreground tabular-nums underline-offset-4 hover:underline focus-visible:rounded-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  )
}
