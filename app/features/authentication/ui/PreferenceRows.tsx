import { SegmentedControl } from '@unitae/ui'
import { useSubmit } from 'react-router'
import { FOLLOW_CONGREGATION } from '~/features/authentication/schemas/account-locale.schema'
import * as m from '~/i18n/paraglide/messages'
import { type Locale, locales } from '~/i18n/paraglide/runtime'
import { type ThemeChoice, useTheme } from '~/shared/ui/hooks/use-theme'
import { SettingRow } from '~/shared/ui/SettingRow'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { languageName } from '~/shared/utils/language'

/**
 * The language of the app and of the emails the account gets: its own, or its congregation's. Choosing one saves
 * it at once; the page then reloads in it, since the client translates with what the page loaded with.
 *
 * @param locale the language the account chose for itself, or null when it follows its congregation's
 */
export function LanguageRow({ locale, congregationLocale }: { locale: Locale | null; congregationLocale: Locale }) {
  const submit = useSubmit()

  return (
    <SettingRow title={m.account_language_title()} description={m.account_language_description()}>
      <Select
        name="locale"
        defaultValue={locale ?? FOLLOW_CONGREGATION}
        onValueChange={value => submit({ locale: value }, { method: 'post', action: '/me/language' })}
      >
        <SelectTrigger aria-label={m.account_language_title()} className="min-w-60">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value={FOLLOW_CONGREGATION}>
            {m.account_language_congregation({ language: languageName(congregationLocale) })}
          </SelectItem>
          {locales.map(each => (
            <SelectItem key={each} value={each}>
              {languageName(each)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingRow>
  )
}

const THEMES: { value: ThemeChoice; label: () => string }[] = [
  { value: 'system', label: m.theme_system },
  { value: 'light', label: m.theme_light },
  { value: 'dark', label: m.theme_dark },
]

/** The theme of this device: the same choice as the congregation menu's, kept in the browser. */
export function ThemeRow() {
  const [theme, setTheme] = useTheme()

  return (
    <SettingRow title={m.theme_label()} description={m.account_theme_description()}>
      <SegmentedControl
        aria-label={m.theme_label()}
        options={THEMES.map(each => ({ value: each.value, label: each.label() }))}
        value={theme}
        onValueChange={setTheme}
        className="w-66"
      />
    </SettingRow>
  )
}
