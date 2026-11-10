import { parseWithZod } from '@conform-to/zod/v4'
import { data, redirect } from 'react-router'
import { consentSchema } from '~/features/authentication/schemas/login.schema'
import { PrivacySettings } from '~/features/authentication/ui/PrivacySettings'
import * as m from '~/i18n/paraglide/messages'
import { congregationContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ConsentPurpose, getActiveConsents, withdrawConsent } from '~/shared/domain/consent.server'
import { AccountPage } from '~/shared/ui/AccountPage'
import type { Route } from './+types/privacy'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.account_section_privacy()} - Unitae` }]
}

export function loader({ context }: Route.LoaderArgs) {
  const account = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    const consents = await getActiveConsents(db, account.id)
    return {
      consents: consents.map(({ id, purpose, consentedAt, consentVersion }) => ({
        id,
        purpose,
        consentedAt,
        consentVersion,
      })),
      timezone: context.get(congregationContext).timezone,
    }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const currentUser = context.get(currentAccountContext)
  const submission = parseWithZod(await request.formData(), { schema: consentSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { purpose } = submission.value

  await withScopeFromContext(context, async db => {
    await withdrawConsent(db, currentUser.id, purpose as ConsentPurpose)
  })

  audit({
    action: AuditAction.ConsentWithdrawn,
    congregationId: currentUser.congregationId,
    actorId: currentUser.id,
    entityType: 'User',
    entityId: currentUser.id,
    metadata: { purpose },
  })

  // Without the data-processing consent the app cannot be used: the consent page asks to accept it again or to
  // sign out. Any other purpose leaves the person here.
  return redirect(purpose === ConsentPurpose.DataProcessing ? '/consent' : '/me/privacy')
}

export default function PrivacyPage({ loaderData }: Route.ComponentProps) {
  return (
    <AccountPage title={m.account_section_privacy()} subtitle={m.account_privacy_subtitle()}>
      <PrivacySettings consents={loaderData.consents} timezone={loaderData.timezone} />
    </AccountPage>
  )
}
