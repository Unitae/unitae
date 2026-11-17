import { Callout } from '@unitae/ui'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import type { HelpArticleView } from '~/features/help/model/help.type'
import { capturePressed, HelpCaptureDialog, type OpenedCapture } from '~/features/help/ui/HelpCaptureDialog'
import { HelpFallback } from '~/features/help/ui/HelpFallback'
import * as m from '~/i18n/paraglide/messages'

// The body is written in Markdown; these arbitrary variants give its elements the app's type scale and colours. A
// capture keeps its own size and shrinks to the column, never stretched past it. A capture inside a step wraps each
// step's text in a paragraph: its first one takes no margin, so the steps keep the spacing of a list without one.
const BODY =
  '[&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-border [&_li>p:first-child]:mt-0 text-sm leading-relaxed text-foreground [&_h2]:mt-6 [&_h2]:mb-1 [&_h2]:font-semibold [&_h2]:text-base [&_h2]:text-foreground [&_p]:mt-3 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_strong]:font-semibold [&_a]:text-brand-text [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded-sm [&_code]:bg-subtle [&_code]:px-1 [&_code]:text-[0.85em]'

/**
 * The reading part of an article, shared by its page and the side panel. The page or the panel draws the title and
 * the summary; this draws the body, the related articles and the fallback. `relatedTo` gives the address each related
 * article opens at.
 */
export function HelpArticleBody({
  view,
  relatedTo,
}: {
  view: HelpArticleView | undefined
  relatedTo: (slug: string) => string
}) {
  const body = useRef<HTMLDivElement>(null)
  const [opened, setOpened] = useState<OpenedCapture | null>(null)
  const html = view?.kind === 'found' ? view.html : null

  // The body is server HTML: its capture buttons are found by a listener, not by React.
  useEffect(() => {
    const element = body.current
    if (element == null || html == null) return
    const open = (event: MouseEvent) => {
      const capture = capturePressed(event.target)
      if (capture != null) setOpened(capture)
    }
    element.addEventListener('click', open)
    return () => element.removeEventListener('click', open)
  }, [html])

  if (view == null) return null

  if (view.kind !== 'found') {
    return (
      <div className="flex flex-col gap-5">
        {view.kind === 'error' ? (
          <Callout tone="danger" role="alert" title={m.help_load_error()} />
        ) : (
          <p className="text-muted-foreground text-sm">
            {view.kind === 'forbidden' ? m.help_unavailable() : m.help_missing()}
          </p>
        )}
        <HelpFallback />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        ref={body}
        className={BODY}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered from repo Markdown with raw HTML disabled, never user input
        // biome-ignore lint/style/useNamingConvention: React's own prop shape for raw HTML
        dangerouslySetInnerHTML={{ __html: view.html }}
      />
      <HelpCaptureDialog capture={opened} onClose={() => setOpened(null)} />
      {view.related.length > 0 && (
        <section aria-labelledby="help-related-title" className="border-border border-t pt-4">
          <h2 id="help-related-title" className="font-medium text-muted-foreground text-sm">
            {m.help_related_title()}
          </h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {view.related.map(related => (
              <li key={related.slug}>
                <Link to={relatedTo(related.slug)} className="text-brand-text underline underline-offset-2">
                  {related.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <HelpFallback />
    </div>
  )
}
