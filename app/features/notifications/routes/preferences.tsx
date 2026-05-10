import { parseWithZod } from '@conform-to/zod'
import { data, useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Switch } from '~/shared/ui/switch'
import { NOTIFICATION_CATEGORIES } from '../model/notification-preference.type'
import { togglePreferenceSchema } from '../schemas/preference.schema'
import { getUserPreferences, togglePreference } from '../server/preferences.server'

import type { Route } from './+types/preferences'

const CATEGORY_LABELS: Record<string, () => string> = {
  board: () => m.notification_category_board(),
}

const TYPE_LABELS: Record<string, () => string> = {
  'board.document.created': () => m.notification_board_document_created(),
  'board.document.deleted': () => m.notification_board_document_deleted(),
}

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.notification_preferences_page_title()} - Unitae` }]
}

export function loader({ context }: Route.LoaderArgs) {
  const currentUser = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    const preferences = await getUserPreferences(db, currentUser.id)
    return { preferences }
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
  const { preferences } = loaderData

  // Build a map of disabled types for quick lookup
  const disabledTypes = new Set(preferences.filter(p => !p.enabled).map(p => p.notificationType))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.notification_preferences_page_title()}
        subtitle={m.notification_preferences_page_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_my_profile(), to: '/me/profile' },
          { label: m.notification_preferences_page_title() },
        ]}
        backTo="/me/profile"
      />

      {NOTIFICATION_CATEGORIES.map(category => (
        <Card key={category.key}>
          <CardHeader>
            <CardTitle>{CATEGORY_LABELS[category.key]?.() ?? category.key}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {category.types.map(typeInfo => (
                <PreferenceToggle
                  key={typeInfo.type}
                  notificationType={typeInfo.type}
                  label={TYPE_LABELS[typeInfo.type]?.() ?? typeInfo.type}
                  enabled={!disabledTypes.has(typeInfo.type) && !disabledTypes.has(`${category.key}.*`)}
                  critical={typeInfo.critical}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function PreferenceToggle({
  notificationType,
  label,
  enabled,
  critical,
}: {
  notificationType: string
  label: string
  enabled: boolean
  critical?: boolean
}) {
  const fetcher = useFetcher()
  const optimisticEnabled = fetcher.formData ? fetcher.formData.get('enabled') === 'true' : enabled

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <Label htmlFor={notificationType} className="font-normal text-sm">
        {label}
      </Label>
      <fetcher.Form method="post">
        <input type="hidden" name="notificationType" value={notificationType} />
        <input type="hidden" name="enabled" value={String(!optimisticEnabled)} />
        <Switch
          id={notificationType}
          checked={optimisticEnabled}
          disabled={critical}
          onCheckedChange={() => {
            fetcher.submit({ notificationType, enabled: String(!optimisticEnabled) }, { method: 'post' })
          }}
        />
      </fetcher.Form>
    </div>
  )
}
