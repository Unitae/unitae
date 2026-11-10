import { parseWithZod } from '@conform-to/zod/v4'
import { Panel, SectionHeading } from '@unitae/ui'
import { data, useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { AccountPage } from '~/shared/ui/AccountPage'
import { SettingRow } from '~/shared/ui/SettingRow'
import { Switch } from '~/shared/ui/switch'
import type { NotificationTypeView } from '../model/notification-preference.type'
import { togglePreferenceSchema } from '../schemas/preference.schema'
import { derivePreferenceCategories } from '../server/preference-categories.server'
import { reachableNotificationTypes } from '../server/preference-reach.server'
import { getUserPreferences, togglePreference } from '../server/preferences.server'

import type { Route } from './+types/preferences'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.account_section_notifications()} - Unitae` }]
}

export function loader({ context }: Route.LoaderArgs) {
  const account = context.get(currentAccountContext)
  const permissions = context.get(permissionsContext)

  return withScopeFromContext(context, async db => {
    const [preferences, reachable] = await Promise.all([
      getUserPreferences(db, account.id),
      reachableNotificationTypes(db, {
        accountId: account.id,
        congregationId: account.congregationId,
        hasMember: account.memberId != null,
        permissions,
      }),
    ])
    const disabled = new Set(preferences.filter(p => !p.enabled).map(p => p.notificationType))
    // Only the types that can reach this account; a category-wide « off » (`board.*`) still counts.
    const categories = derivePreferenceCategories(reachable).map(category => ({
      ...category,
      types: category.types.map(type => ({
        ...type,
        enabled: !disabled.has(type.type) && !disabled.has(`${category.key}.*`),
      })),
    }))
    return { email: account.email, categories }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const currentUser = context.get(currentAccountContext)
  const submission = parseWithZod(await request.formData(), { schema: togglePreferenceSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { notificationType, enabled } = submission.value

  await withScopeFromContext(context, async db => {
    await togglePreference(db, currentUser.id, currentUser.congregationId, notificationType, enabled)
  })

  return { ok: true }
}

export default function NotificationPreferencesPage({ loaderData }: Route.ComponentProps) {
  const { email, categories } = loaderData

  return (
    <AccountPage title={m.account_section_notifications()} subtitle={m.account_notifications_subtitle({ email })}>
      {categories.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.account_notifications_empty()}</p>
      ) : (
        categories.map(category => (
          <section key={category.key} aria-labelledby={`notifications-${category.key}`}>
            <SectionHeading id={`notifications-${category.key}`} title={category.label} meta={category.hint} />
            <Panel>
              {category.types.map(type => (
                <PreferenceRow key={type.type} type={type} />
              ))}
            </Panel>
          </section>
        ))
      )}
      <p className="text-faint text-sm leading-relaxed">{m.account_notifications_note()}</p>
    </AccountPage>
  )
}

/** One email, switched on or off at once; a critical one shows its switch on and locked. */
function PreferenceRow({ type }: { type: NotificationTypeView & { enabled: boolean } }) {
  const fetcher = useFetcher()
  const optimistic = fetcher.formData ? fetcher.formData.get('enabled') === 'true' : type.enabled
  const id = `notification-${type.type}`

  return (
    <SettingRow
      htmlFor={id}
      title={type.label}
      description={type.critical ? m.account_notifications_always() : type.description}
    >
      <Switch
        id={id}
        checked={type.critical || optimistic}
        disabled={type.critical}
        onCheckedChange={checked => {
          fetcher.submit({ notificationType: type.type, enabled: String(checked) }, { method: 'post' })
        }}
      />
    </SettingRow>
  )
}
