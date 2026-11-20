import { Info } from 'lucide-react'
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

/**
 * Whether the visitor has been in the demo long enough to be asked if it suits them: three minutes after their first
 * page, counted across pages and role switches (the tab's session storage). Without storage, from this page.
 */
function useNudgeDue(): boolean {
  const [due, setDue] = useState(false)
  useEffect(() => {
    let started = Date.now()
    try {
      const stored = Number(window.sessionStorage.getItem(STARTED_KEY))
      if (stored > 0) started = stored
      else window.sessionStorage.setItem(STARTED_KEY, String(started))
    } catch {
      // Storage refused (a private window): count from this page.
    }
    const left = started + NUDGE_AFTER_MS - Date.now()
    if (left <= 0) {
      setDue(true)
      return
    }
    const timer = window.setTimeout(() => setDue(true), left)
    return () => window.clearTimeout(timer)
  }, [])
  return due
}

/**
 * On every page of a demo copy, and it can't be closed: it says the data is invented, who the visitor is (the role
 * picker, which also switches), and leads to creating a congregation, asking after a few minutes whether the demo
 * suits them. One quiet row that wraps on a narrow screen; its button stays secondary until the nudge, so the page's
 * own action keeps the accent.
 */
export function DemoBanner({ demo }: { demo: { role: DemoRole | null; registerUrl: string | null } | null }) {
  const nudge = useNudgeDue()
  if (demo == null) return null
  const asking = nudge && demo.registerUrl != null

  return (
    <section
      aria-label={m.demo_banner_label()}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-border border-b bg-brand-soft px-4 py-2 text-sm md:px-6 print:hidden"
    >
      <p className="m-0 flex min-w-0 flex-1 basis-64 items-baseline gap-x-2 gap-y-0.5 max-sm:flex-col">
        <span className="flex shrink-0 items-center gap-2 whitespace-nowrap font-medium text-foreground">
          <Info className="size-4 shrink-0 self-center text-brand-text" aria-hidden="true" />
          {m.demo_banner_label()}
        </span>
        {asking && <span className="text-muted-foreground">{m.demo_banner_nudge()}</span>}
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
        {demo.registerUrl && (
          <Button asChild size="sm" variant={asking ? 'default' : 'outline'}>
            <a href={registerLinkFromDemo(demo.registerUrl, demo.role)}>{m.demo_banner_register()}</a>
          </Button>
        )}
      </div>
    </section>
  )
}
