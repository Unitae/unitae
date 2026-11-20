import { Info, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Form } from 'react-router'
import { DEMO_ROLES, type DemoRole, registerLinkFromDemo } from '~/features/demo/model/demo-role'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

export function demoRoleLabel(role: DemoRole): string {
  switch (role) {
    case 'coordinator':
      return m.demo_role_coordinator()
    case 'secretary':
      return m.demo_role_secretary()
    case 'programmes':
      return m.demo_role_programmes()
    case 'territories':
      return m.demo_role_territories()
    case 'group-overseer':
      return m.demo_role_group_overseer()
    case 'publisher':
      return m.demo_role_publisher()
  }
}

const NUDGE_AFTER_MS = 3 * 60 * 1000
const STARTED_KEY = 'unitae-demo-started'
const NUDGED_KEY = 'unitae-demo-nudged'

/**
 * Asks whether the demo suits the visitor: a card in the corner three minutes after their first page, counted across
 * pages and role switches (the tab's session storage), with the way to create a congregation. It stays across pages
 * until closed or followed, then never comes back in that tab. Without storage, counted from this page. Bottom right,
 * clear of the banner and the page's actions; above the tab bar on a phone.
 */
function DemoNudge({ registerLink }: { registerLink: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let started = Date.now()
    try {
      if (window.sessionStorage.getItem(NUDGED_KEY)) return
      const stored = Number(window.sessionStorage.getItem(STARTED_KEY))
      if (stored > 0) started = stored
      else window.sessionStorage.setItem(STARTED_KEY, String(started))
    } catch {
      // Storage refused (a private window): count from this page.
    }
    const timer = window.setTimeout(() => setOpen(true), Math.max(0, started + NUDGE_AFTER_MS - Date.now()))
    return () => window.clearTimeout(timer)
  }, [])

  const done = () => {
    try {
      window.sessionStorage.setItem(NUDGED_KEY, '1')
    } catch {
      // Asked again on the next full page load, at worst.
    }
    setOpen(false)
  }

  if (!open) return null
  return (
    <aside
      aria-label={m.demo_nudge_title()}
      className="fixed right-4 bottom-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-background p-4 shadow-lg max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] print:hidden"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 text-sm">
          <p className="m-0 font-medium text-foreground">{m.demo_nudge_title()}</p>
          <p className="m-0 mt-1 text-muted-foreground">{m.demo_nudge_body()}</p>
        </div>
        <button
          type="button"
          onClick={done}
          aria-label={m.common_close()}
          className="-mt-1.5 -mr-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground md:size-8"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <Button asChild size="sm" className="mt-3">
        <a href={registerLink} onClick={done}>
          {m.demo_banner_register()}
        </a>
      </Button>
    </aside>
  )
}

/**
 * On every page of a demo copy, and it can't be closed: it says the data is invented, who the visitor is (the role
 * picker, which also switches), and leads to creating a congregation. One quiet row that wraps on a narrow screen;
 * its button is secondary, so the page's own action keeps the accent. After a few minutes, a card in the corner
 * asks whether the demo suits them (`DemoNudge`).
 */
export function DemoBanner({ demo }: { demo: { role: DemoRole | null; registerUrl: string | null } | null }) {
  if (demo == null) return null
  const registerLink = demo.registerUrl ? registerLinkFromDemo(demo.registerUrl, demo.role) : null

  return (
    <>
      <section
        aria-label={m.demo_banner_label()}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-border border-b bg-brand-soft px-4 py-2 text-sm md:px-6 print:hidden"
      >
        <p className="m-0 flex flex-1 items-center gap-2 whitespace-nowrap font-medium text-foreground">
          <Info className="size-4 shrink-0 text-brand-text" aria-hidden="true" />
          {m.demo_banner_label()}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Form method="post" action="/demo/role" className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">{m.demo_banner_you_are()}</span>
              <select
                name="role"
                defaultValue={demo.role ?? ''}
                aria-label={m.demo_banner_switch()}
                onChange={event => event.currentTarget.form?.requestSubmit()}
                className="h-8 max-w-[15rem] truncate rounded-md border border-input bg-background px-2"
              >
                {demo.role == null && <option value="" disabled />}
                {DEMO_ROLES.map(role => (
                  <option key={role} value={role}>
                    {demoRoleLabel(role)}
                  </option>
                ))}
              </select>
            </label>
            <noscript>
              <Button type="submit" size="sm" variant="outline">
                {m.demo_banner_switch()}
              </Button>
            </noscript>
          </Form>
          {registerLink && (
            <Button asChild size="sm" variant="outline">
              <a href={registerLink}>{m.demo_banner_register()}</a>
            </Button>
          )}
        </div>
      </section>
      {registerLink && <DemoNudge registerLink={registerLink} />}
    </>
  )
}
