import { locales } from '~/i18n/paraglide/runtime'
import { AuthField } from '~/shared/ui/auth-parts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { DEFAULT_LOCALE, languageLabel } from '~/shared/utils/language'

/** The congregation's language, chosen when it is created. */
export function LocaleField({
  id,
  name,
  initialValue,
  label,
  help,
}: {
  id: string
  name: string
  initialValue: string | undefined
  label: string
  help?: string
}) {
  return (
    <AuthField id={id} label={label} help={help}>
      <Select name={name} defaultValue={initialValue ?? DEFAULT_LOCALE}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {locales.map(locale => (
            <SelectItem key={locale} value={locale}>
              {languageLabel(locale)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </AuthField>
  )
}
