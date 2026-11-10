import { redirect } from 'react-router'
import { getAccountProfile } from '~/features/authentication/server/account-profile.queries'
import { getCalendarFeedToken } from '~/features/authentication/server/calendar-feed-token.server'
import { CalendarFeedPanel } from '~/features/authentication/ui/CalendarFeedPanel'
import { ProfileRecord } from '~/features/authentication/ui/ProfileRecord'
import * as m from '~/i18n/paraglide/messages'
import { congregationContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { AccountPage } from '~/shared/ui/AccountPage'
import type { Route } from './+types/profile'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.account_section_profile()} - Unitae` }]
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const account = context.get(currentAccountContext)
  const congregation = context.get(congregationContext)

  const [profile, calendarToken] = await Promise.all([
    withScopeFromContext(context, db => getAccountProfile(db, account.id)),
    getCalendarFeedToken(account.id),
  ])
  if (profile == null) throw redirect('/')

  return {
    profile,
    congregationName: congregation.displayName ?? congregation.name,
    calendar: calendarToken
      ? {
          url: new URL(`/feed/${calendarToken.token}/calendar.ics`, request.url).toString(),
          lastUsedAt: calendarToken.lastUsedAt,
        }
      : null,
  }
}

export default function ProfilePage({ loaderData }: Route.ComponentProps) {
  const { profile, congregationName, calendar } = loaderData

  return (
    <AccountPage title={m.account_section_profile()} subtitle={m.account_profile_subtitle()}>
      <ProfileRecord profile={profile} congregation={congregationName} />
      <CalendarFeedPanel calendar={calendar} />
    </AccountPage>
  )
}
