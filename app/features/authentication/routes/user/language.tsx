import { parseWithZod } from '@conform-to/zod/v4'
import { redirect, redirectDocument } from 'react-router'
import { accountLocaleSchema, FOLLOW_CONGREGATION } from '~/features/authentication/schemas/account-locale.schema'
import { setAccountLocale } from '~/features/authentication/server/set-account-locale.server'
import { currentAccountContext } from '~/shared/auth/route-context.server'
import type { Route } from './+types/language'

export function loader() {
  throw redirect('/me/profile')
}

export async function action({ request, context }: Route.ActionArgs) {
  const currentUser = context.get(currentAccountContext)

  const submission = parseWithZod(await request.formData(), { schema: accountLocaleSchema })
  // The select only offers valid choices: anything else did not come from the form.
  if (submission.status !== 'success') return redirect('/me/profile')

  const { locale } = submission.value
  const changed = await setAccountLocale(
    currentUser.id,
    currentUser.congregationId,
    locale === FOLLOW_CONGREGATION ? null : locale,
    currentUser.id,
  )

  // The client translates with what the page loaded with: a new language shows on a full load only.
  return changed ? redirectDocument('/me/profile') : redirect('/me/profile')
}
