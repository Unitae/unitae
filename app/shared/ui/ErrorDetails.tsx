import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'

import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'

/**
 * « Détails techniques », folded: the page and the time, and a ready-made report on GitHub, for whoever is asked
 * to look into it. Only under a server error.
 */
export function ErrorDetails({ pathname }: { pathname: string }) {
  // Read after hydration: the time and the browser are the visitor's, and the server render could only guess them.
  const [visit, setVisit] = useState<{ at: Date; browser: string } | null>(null)
  useEffect(() => setVisit({ at: new Date(), browser: navigator.userAgent }), [])

  const time = visit
    ? new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(visit.at)
    : ''
  const title = encodeURIComponent(`Bug: Unexpected error on ${pathname}`)
  const body = encodeURIComponent(
    `## Description\n\nAn unexpected error occurred.\n\n## Technical details\n\n- **Route:** ${pathname}\n- **Timestamp:** ${visit?.at.toISOString() ?? ''}\n- **Browser:** ${visit?.browser ?? ''}\n\n## Steps to reproduce\n\n1. ...\n`,
  )

  return (
    <details className="group rounded-md border px-3 py-2 text-faint text-sm">
      <summary className="cursor-pointer select-none transition-colors hover:text-foreground">
        {m.error_technical_details()}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="font-mono text-xs leading-relaxed">
          {m.error_detail_route()} {pathname}
          <br />
          {m.error_detail_time()} {time}
        </p>
        <a
          href={`https://github.com/Unitae/unitae/issues/new?title=${title}&body=${body}&labels=bug`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 self-start text-brand-text underline-offset-4 hover:underline"
        >
          {m.error_report_issue()}
          <ExternalLink aria-hidden="true" className="size-3" />
        </a>
      </div>
    </details>
  )
}
