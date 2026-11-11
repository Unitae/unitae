import { ProgressBar, Status } from '@unitae/ui'
import { Download } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useRevalidator } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

export interface TransferJob {
  state: string
  progress: number
  failedReason: string | null
}

interface TransferProgressProps {
  kind: 'export' | 'import'
  job: TransferJob
  /** Where the finished export downloads from. */
  downloadHref?: string
}

/** An export or an import under way: its progress while it runs (the page asks again every two seconds), then how it ended. */
export function TransferProgress({ kind, job, downloadHref }: TransferProgressProps) {
  const revalidator = useRevalidator()
  const finished = job.state === 'completed' || job.state === 'failed'
  useEffect(() => {
    if (finished) return
    const interval = setInterval(() => revalidator.revalidate(), 2000)
    return () => clearInterval(interval)
  }, [finished, revalidator])

  const exporting = kind === 'export'
  if (job.state === 'failed') {
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-lg border px-4 py-3">
        <Status tone="danger">{exporting ? m.export_status_failed() : m.import_status_failed()}</Status>
        <p className="text-muted-foreground text-sm">
          {exporting ? m.export_status_failed_message() : m.import_status_failed_message()}
        </p>
        {job.failedReason && (
          <details className="text-faint text-xs">
            <summary className="cursor-pointer">{m.settings_data_failed_details()}</summary>
            <p className="mt-1 font-mono">{job.failedReason}</p>
          </details>
        )}
        <Button asChild variant="ghost" size="sm" className="self-start">
          <Link to="/settings/data">{m.settings_data_done()}</Link>
        </Button>
      </div>
    )
  }
  if (job.state === 'completed') {
    return (
      <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
        <Status tone="success">{exporting ? m.export_status_completed() : m.import_status_completed()}</Status>
        <span className="flex-1 text-muted-foreground text-sm">
          {exporting ? m.export_status_completed_message() : m.import_status_completed_message()}
        </span>
        {exporting && downloadHref ? (
          <Button asChild size="sm">
            <a href={downloadHref}>
              <Download aria-hidden="true" />
              {m.export_status_download()}
            </a>
          </Button>
        ) : (
          <Button asChild variant="ghost" size="sm">
            <Link to="/settings/data">{m.settings_data_done()}</Link>
          </Button>
        )}
      </div>
    )
  }
  return (
    <div role="status" className="flex flex-col gap-2 rounded-lg border px-4 py-3">
      <span className="font-medium text-sm">{exporting ? m.export_status_title() : m.import_status_title()}</span>
      <ProgressBar
        value={job.progress}
        max={100}
        aria-label={exporting ? m.export_status_title() : m.import_status_title()}
      />
      <span className="text-faint text-xs">
        {job.progress > 0
          ? (exporting ? m.export_status_progress : m.import_status_progress)({ progress: String(job.progress) })
          : exporting
            ? m.export_status_waiting()
            : m.import_status_waiting()}
      </span>
    </div>
  )
}
