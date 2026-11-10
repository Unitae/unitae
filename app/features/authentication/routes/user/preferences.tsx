import { Panel } from '@unitae/ui'
import { LanguageRow, ThemeRow } from '~/features/authentication/ui/PreferenceRows'
import * as m from '~/i18n/paraglide/messages'
import { isLocale } from '~/i18n/paraglide/runtime'
import { congregationContext, currentAccountContext } from '~/shared/auth/route-context.server'
import { AccountPage } from '~/shared/ui/AccountPage'
import { DEFAULT_LOCALE } from '~/shared/utils/language'
import type { Route } from './+types/preferences'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.account_section_preferences()} - Unitae` }]
}

export function loader({ context }: Route.LoaderArgs) {
  const account = context.get(currentAccountContext)
  const congregation = context.get(congregationContext)

  return {
    // Both columns are free text: a locale the app does not ship reads as none.
    locale: isLocale(account.locale) ? account.locale : null,
    congregationLocale: isLocale(congregation.locale) ? congregation.locale : DEFAULT_LOCALE,
  }
}

export default function PreferencesPage({ loaderData }: Route.ComponentProps) {
  return (
    <AccountPage title={m.account_section_preferences()} subtitle={m.account_preferences_subtitle()}>
      <Panel aria-label={m.account_section_preferences()}>
        <LanguageRow locale={loaderData.locale} congregationLocale={loaderData.congregationLocale} />
        <ThemeRow />
      </Panel>
    </AccountPage>
  )
}
