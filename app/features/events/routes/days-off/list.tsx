import { Panel } from '@unitae/ui'
import { CalendarOff, CalendarPlus } from 'lucide-react'
import { Link } from 'react-router'

import { listMyAbsences } from '~/features/events/server/days-off.queries'
import { MyAbsenceRow } from '~/features/events/ui/MyAbsenceRow'
import * as m from '~/i18n/paraglide/messages'
import { congregationContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.days_off_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const currentUser = context.get(currentAccountContext)
  const { timezone } = context.get(congregationContext)
  const now = new Date()

  return withScopeFromContext(context, async db => {
    const absences = await listMyAbsences(db, {
      accountId: currentUser.id,
      memberId: currentUser.member?.id ?? null,
      congregationId: currentUser.congregationId,
      now,
    })
    return { absences, timeZone: timezone, now }
  })
}

export default function DaysOffPage({ loaderData }: Route.ComponentProps) {
  const { absences, timeZone, now } = loaderData

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader
        title={m.days_off_page_title()}
        titleBadge={
          absences.length > 0 ? (
            <span className="text-base text-faint tabular-nums">
              {m.days_off_upcoming_count({ count: absences.length })}
            </span>
          ) : undefined
        }
        subtitle={m.days_off_page_subtitle()}
        breadcrumbs={[{ label: m.sidebar_my_absences() }]}
        actions={
          <Button asChild size="sm">
            <Link to="/me/days-off/new">
              <CalendarPlus aria-hidden="true" />
              {m.days_off_new_button()}
            </Link>
          </Button>
        }
      />

      {absences.length > 0 ? (
        <Panel aria-label={m.days_off_page_title()}>
          <ul>
            {absences.map(absence => (
              <MyAbsenceRow key={absence.id} absence={absence} timeZone={timeZone} now={new Date(now)} />
            ))}
          </ul>
        </Panel>
      ) : (
        <EmptyState icon={CalendarOff} title={m.days_off_empty_title()} description={m.days_off_empty_description()} />
      )}
    </div>
  )
}
