import { parseWithZod } from '@conform-to/zod'
import { data, Form, Link, redirect } from 'react-router'
import { consentSchema } from '~/features/authentication/schemas/login.schema'
import * as m from '~/paraglide/messages'
import { userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { type ConsentPurpose, getActiveConsents, withdrawConsent } from '~/shared/domain/consent.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import type { Route } from './+types/consents'

const PURPOSE_LABELS: Record<string, () => string> = {
  // biome-ignore lint/style/useNamingConvention: database enum values
  DATA_PROCESSING: () => m.consent_purpose_data_processing(),
  // biome-ignore lint/style/useNamingConvention: database enum values
  EMAIL_NOTIFICATIONS: () => m.consent_purpose_email_notifications(),
}

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.user_consents_page_title()} - Unitae` }]
}

export function loader({ context }: Route.LoaderArgs) {
  const currentUser = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const consents = await getActiveConsents(db, currentUser.id)
    return { consents }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const currentUser = context.get(userContext)
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
    metadata: { purpose },
  })

  return redirect('/me/consents')
}

export default function ConsentsPage({ loaderData }: Route.ComponentProps) {
  const { consents } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.user_consents_page_title()} subtitle={m.user_consents_page_subtitle()} />

      <Card>
        <CardHeader>
          <CardTitle>{m.user_consents_active_section()}</CardTitle>
        </CardHeader>
        <CardContent>
          {consents.length === 0 ? (
            <p className="text-muted-foreground text-sm">{m.user_consents_empty_message()}</p>
          ) : (
            <div className="divide-y">
              {consents.map(consent => (
                <div key={consent.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="font-medium text-sm">{PURPOSE_LABELS[consent.purpose]?.() ?? consent.purpose}</p>
                    <p className="text-muted-foreground text-xs">
                      {m.user_consents_granted_on({
                        date: new Date(consent.consentedAt).toLocaleDateString('fr-FR'),
                        version: consent.consentVersion,
                      })}
                    </p>
                  </div>
                  <Form method="post">
                    <input type="hidden" name="purpose" value={consent.purpose} />
                    <Button type="submit" variant="outline" size="sm">
                      {m.user_consents_withdraw_button()}
                    </Button>
                  </Form>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        {m.user_consents_privacy_notice()}{' '}
        <Link to="/privacy" className="underline">
          {m.user_consents_privacy_link()}
        </Link>
        .
      </p>
    </div>
  )
}
