import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link, redirect, type ShouldRevalidateFunctionArgs } from 'react-router'

import { toServiceYear } from '~/features/publishers'
import { getPioneerActivitySummary } from '~/features/publishers/index.server'
import { PioneerRoster } from '~/features/publishers/ui/PioneerRoster'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.pioneers_title()}
        subtitle={m.pioneers_subtitle()}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="icon" aria-label={m.pioneers_previous_year()}>
              <Link to={`?sy=${serviceYear - 1}`}>
                <ChevronLeft className="size-4" />
              </Link>
            </Button>
            <span className="whitespace-nowrap font-medium text-sm">
              {m.pioneers_service_year({ start: String(serviceYear), end: String(serviceYear + 1) })}
            </span>
            <Button asChild variant="outline" size="icon" aria-label={m.pioneers_next_year()}>
              <Link to={`?sy=${serviceYear + 1}`}>
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          </div>
        }
      />
      <PioneerRoster summary={summary} />
    </div>
  )
}
