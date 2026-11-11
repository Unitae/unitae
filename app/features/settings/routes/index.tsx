import { ArrowUpRight, ChevronRight } from 'lucide-react'
import { Link, redirect, useRouteLoaderData } from 'react-router'
import { loadSettingsAccess } from '~/features/settings/server/settings-access.server'
import { firstSettingsHref } from '~/features/settings/settings-sections'
import { SETTINGS_GROUP_LABEL } from '~/features/settings/ui/SettingsRail'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SETTINGS_ENTRY_DISPLAY } from '~/shared/ui/settings-entries'
import type { loader as layoutLoader } from './_layout'
import type { Route } from './+types/index'

const WIDE = '(min-width: 48rem)'

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const account = context.get(currentAccountContext)
  const access = await withScopeFromContext(context, (db, congregationId) =>
    loadSettingsAccess(db, permissions, account.id, congregationId),
  )
  return { first: firstSettingsHref(access) }
}

// A wide screen has the column beside every part, so Réglages opens straight on the first part the viewer may open;
// a phone keeps this page as its list of parts.
export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  const data = await serverLoader()
  if (data.first && window.matchMedia(WIDE).matches) throw redirect(data.first)
  return data
}
clientLoader.hydrate = true as const

const ROW =
  'flex min-h-13 items-center gap-3 border-t px-3.5 text-[0.9375rem] outline-hidden first:border-t-0 hover:bg-hover focus-visible:bg-hover [&>svg:first-child]:size-4 [&>svg:first-child]:text-faint'

export default function SettingsIndex() {
  const layout = useRouteLoaderData<typeof layoutLoader>('features/settings/routes/_layout')
  const groups = layout?.groups ?? []

  return (
    <div className="md:hidden">
      <PageHeader title={m.settings_title()} breadcrumbs={[{ label: m.settings_title() }]} />
      <div className="flex flex-col gap-4">
        {groups.map(group => (
          <section key={group.key} className="flex flex-col gap-1.5">
            <h2 className="px-0.5 font-medium text-faint text-xs">{SETTINGS_GROUP_LABEL[group.key]()}</h2>
            <div className="overflow-hidden rounded-lg border bg-card">
              {group.entries.map(entry => {
                const { icon: Icon, label } = SETTINGS_ENTRY_DISPLAY[entry.key]
                return entry.external ? (
                  <a key={entry.key} href={entry.href} target="_blank" rel="noreferrer" className={ROW}>
                    <Icon aria-hidden="true" />
                    <span className="flex-1">{label()}</span>
                    <ArrowUpRight aria-hidden="true" className="size-4 text-faint" />
                    <span className="sr-only">({m.settings_external_hint()})</span>
                  </a>
                ) : (
                  <Link key={entry.key} to={entry.href} className={ROW}>
                    <Icon aria-hidden="true" />
                    <span className="flex-1">{label()}</span>
                    <ChevronRight aria-hidden="true" className="size-4 text-faint" />
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
