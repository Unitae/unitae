import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { useState } from 'react'

import * as m from '~/paraglide/messages'

export function IssueReportSection({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false)
  const [timestamp] = useState(() => new Date().toISOString())
  const [userAgent] = useState(() => (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'))
  const issueTitle = encodeURIComponent(`Bug: Unexpected error on ${pathname}`)
  const issueBody = encodeURIComponent(
    `## Description\n\nAn unexpected error occurred.\n\n## Technical details\n\n- **Route:** ${pathname}\n- **Timestamp:** ${timestamp}\n- **Browser:** ${userAgent}\n\n## Steps to reproduce\n\n1. ...\n`,
  )
  const issueUrl = `https://github.com/Unitae/unitae/issues/new?title=${issueTitle}&body=${issueBody}&labels=bug`

  return (
    <div className="mt-4 w-full rounded-lg border p-3 text-left text-xs">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between">
        <span className="font-medium text-muted-foreground">{m.error_technical_details()}</span>
        {open ? (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="rounded bg-muted p-2 font-mono text-muted-foreground">
            <div>
              {m.error_detail_route()} {pathname}
            </div>
            <div>
              {m.error_detail_time()} {timestamp}
            </div>
          </div>
          <p className="text-muted-foreground">{m.error_report_issue_description()}</p>
          <a
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary underline"
          >
            {m.error_report_issue()}
            <ExternalLink className="size-3" />
          </a>
        </div>
      )}
    </div>
  )
}
