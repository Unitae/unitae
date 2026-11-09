import { PeriodStepper } from '@unitae/ui'
import { Link, redirect, type ShouldRevalidateFunctionArgs } from 'react-router'

import { toServiceYear } from '~/features/publishers'
import { getPioneerActivitySummary } from '~/features/publishers/index.server'
import { ActivityViewSwitch } from '~/features/publishers/ui/ActivityViewSwitch'
import { PioneerRoster } from '~/features/publishers/ui/PioneerRoster'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { PageHeader } from '~/shared/ui/PageHeader'
import { zonedNow } from '~/shared/utils/zoned-now'

import type { Route } from './+types/pioneers'

export const meta: Route.MetaFunction = () => [{ title: m.pioneers_meta_title() }]

// The roster is loaded once per service year; risk/type/group/search filtering is
// client-side, so only a change to `sy` should refetch.
export function shouldRevalidate({ currentUrl, nextUrl, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (currentUrl.pathname !== nextUrl.pathname) return defaultShouldRevalidate
  return currentUrl.searchParams.get('sy') !== nextUrl.searchParams.get('sy')
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanViewActivity)) throw redirect('/')

  const congregation = context.get(congregationContext)
  const currentUser = context.get(currentAccountContext)
  const now = zonedNow(congregation.timezone)
  const defaultServiceYear = toServiceYear(now.getMonth(), now.getFullYear())

  const requested = Number(new URL(request.url).searchParams.get('sy'))
  const serviceYear = Number.isInteger(requested) && requested > 2000 ? requested : defaultServiceYear

  return withScopeFromContext(context, async db => {
    const summary = await getPioneerActivitySummary(db, currentUser.congregationId, serviceYear, now)
    return { summary, serviceYear }
  })
}

export default function PioneersRoster({ loaderData }: Route.ComponentProps) {
  const { summary, serviceYear } = loaderData

  return (
    // The marker lets the app shell stop clipping as a scroll container, so the docked panel can stick.
    <div data-sticky-content="" className="flex flex-col gap-5">
      <PageHeader
        title={m.activity_page_title()}
        breadcrumbs={[{ label: m.activity_page_title() }]}
        controls={
          <>
            <ActivityViewSwitch value="pioneers" />
            <PeriodStepper
              label={m.pioneers_service_year({ start: String(serviceYear), end: String(serviceYear + 1) })}
              previous={{ label: m.pioneers_previous_year(), href: `?sy=${serviceYear - 1}` }}
              next={{ label: m.pioneers_next_year(), href: `?sy=${serviceYear + 1}` }}
              renderLink={({ href, ...props }) => <Link to={href} {...props} />}
              labelWidth={150}
            />
          </>
        }
      />
      <PioneerRoster summary={summary} />
    </div>
  )
}
