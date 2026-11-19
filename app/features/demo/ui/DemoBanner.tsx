import { Callout } from '@unitae/ui'
import { Form } from 'react-router'
import { DEMO_ROLES, type DemoRole } from '~/features/demo/model/demo-role'
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

/**
 * On every page of a demo copy, and it can't be closed (docs/development/specs/demo-mode.md): it says the data is
 * invented, who the visitor is, lets them switch role, and leads to creating a congregation.
 */
export function DemoBanner({ demo }: { demo: { role: DemoRole | null; registerUrl: string | null } | null }) {
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
              <a href={demo.registerUrl}>{m.demo_banner_register()}</a>
            </Button>
          )}
        </div>
      }
    >
      {demo.role && m.demo_banner_as({ role: demoRoleLabel(demo.role) })}
    </Callout>
  )
}
