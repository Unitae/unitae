import { Callout } from '@unitae/ui'
import { useEffect, useState } from 'react'
import { Form } from 'react-router'
import { DEMO_ROLES, type DemoRole, registerLinkFromDemo } from '~/features/demo/model/demo-role'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { STRIP } from '~/shared/ui/OfflineBanner'

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
 * On every page of a demo copy, and it can't be closed (docs/development/specs/demo-mode.md): it says the data is
 * invented, who the visitor is, lets them switch role, and leads to creating a congregation, asking after a few minutes whether the demo suits them.
 */
export function DemoBanner({ demo }: { demo: { role: DemoRole | null; registerUrl: string | null } | null }) {
  const nudge = useNudgeDue()
  if (demo == null) return null

  return (
    <Callout
      tone="info"
      className={STRIP}
      title={m.demo_banner_label()}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Form method="post" action="/demo/role" className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="max-sm:sr-only">{m.demo_banner_switch()}</span>
              <select
                name="role"
                defaultValue={demo.role ?? ''}
                aria-label={m.demo_banner_switch()}
                onChange={event => event.currentTarget.form?.requestSubmit()}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
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
            <Button asChild size="sm">
              <a href={registerLinkFromDemo(demo.registerUrl, demo.role)}>{m.demo_banner_register()}</a>
            </Button>
          )}
        </div>
      }
    >
      {demo.role && m.demo_banner_as({ role: demoRoleLabel(demo.role) })}
      {nudge && demo.registerUrl && <span className="block font-medium">{m.demo_banner_nudge()}</span>}
    </Callout>
  )
}
