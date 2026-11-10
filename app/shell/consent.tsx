import { Form, Link, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import * as m from '~/i18n/paraglide/messages'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ConsentPurpose, hasDataProcessingConsent, recordConsentUnscoped } from '~/shared/domain/consent.server'
import { AuthShell } from '~/shared/ui/AuthShell'
import { AUTH_SUBMIT, AuthMessage, AuthSignOut } from '~/shared/ui/auth-parts'
import { Button } from '~/shared/ui/button'
import { Checkbox } from '~/shared/ui/checkbox'
import { getClientIp } from '~/shared/utils/get-client-ip'
import type { Route } from './+types/consent'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.consent_page_subtitle()} - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, congregation } = await verifySession(request)

  // Consent already given: nothing to ask, on to the app.
  const hasConsent = await hasDataProcessingConsent(currentUser.id)
  if (hasConsent) {
    throw redirect('/')
  }

  return { congregation: congregation.displayName }
}

export async function action({ request }: Route.ActionArgs) {
  const { currentUser } = await verifySession(request)

  const form = await request.formData()
  const accepted = form.get('consent') === 'on'

  if (!accepted) {
    return { error: m.consent_must_accept_error() }
  }

  const ip = getClientIp(request)
  await recordConsentUnscoped(currentUser.id, currentUser.congregationId, ConsentPurpose.DataProcessing, ip)
  audit({
    action: AuditAction.ConsentGranted,
    congregationId: currentUser.congregationId,
    actorId: currentUser.id,
    entityType: 'User',
    entityId: currentUser.id,
    metadata: { purpose: ConsentPurpose.DataProcessing },
  })

  return redirect('/')
}

// The wording is legal text: it stays word for word, only its layout follows the frame.
export default function ConsentPage({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <AuthShell congregation={loaderData.congregation} title={m.consent_page_subtitle()} wide>
      <div className="flex flex-col gap-3 text-muted-foreground text-sm leading-relaxed">
        <p>{m.consent_description_1()}</p>
        <p>{m.consent_description_2()}</p>
        <p>{m.consent_description_3()}</p>
      </div>
      <Link to="/privacy" className="self-start text-brand-text text-sm underline-offset-4 hover:underline">
        {m.consent_read_privacy_policy()}
      </Link>
      {actionData?.error && <AuthMessage tone="error">{actionData.error}</AuthMessage>}
      <Form method="post" className="flex flex-col gap-5">
        <div className="flex items-start gap-2.5">
          <Checkbox id="consent" name="consent" value="on" className="mt-0.5" />
          <label htmlFor="consent" className="text-sm leading-relaxed">
            {m.consent_accept_checkbox()}
          </label>
        </div>
        <Button type="submit" className={AUTH_SUBMIT}>
          {m.consent_continue()}
        </Button>
      </Form>
      <AuthSignOut>{m.consent_logout()}</AuthSignOut>
    </AuthShell>
  )
}
