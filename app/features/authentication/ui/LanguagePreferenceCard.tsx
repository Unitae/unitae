import { Form } from 'react-router'
import { FOLLOW_CONGREGATION } from '~/features/authentication/schemas/account-locale.schema'
import * as m from '~/i18n/paraglide/messages'
import { type Locale, locales } from '~/i18n/paraglide/runtime'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { languageLabel } from '~/shared/utils/language'

/**
 * @param locale the language the account chose for itself, or null when it follows its congregation's
 * @param congregationLocale the congregation's language, which the account gets by default
 */
export function LanguagePreferenceCard({
  locale,
  congregationLocale,
}: {
  locale: Locale | null
  congregationLocale: Locale
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.user_profile_language_section()}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">{m.user_profile_language_description()}</p>
        <Form method="post" action="/me/language" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="account-locale">{m.user_profile_language_label()}</Label>
            <Select name="locale" defaultValue={locale ?? FOLLOW_CONGREGATION}>
              <SelectTrigger id="account-locale" className="w-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FOLLOW_CONGREGATION}>
                  {m.user_profile_language_congregation({ language: languageLabel(congregationLocale) })}
                </SelectItem>
                {locales.map(each => (
                  <SelectItem key={each} value={each}>
                    {languageLabel(each)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SubmitButton className="w-fit">{m.common_save()}</SubmitButton>
        </Form>
      </CardContent>
    </Card>
  )
}
