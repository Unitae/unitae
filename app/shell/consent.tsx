import { Form, Link, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import * as m from '~/i18n/paraglide/messages'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ConsentPurpose, hasDataProcessingConsent, recordConsentUnscoped } from '~/shared/domain/consent.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '~/shared/ui/card'

import type { Route } from './+types/consent'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Consentement - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)

  // Si l'utilisateur a deja consenti, rediriger vers l'accueil
  const hasConsent = await hasDataProcessingConsent(currentUser.id)
  if (hasConsent) {
    throw redirect('/')
  }

  return {}
}

export async function action({ request }: Route.ActionArgs) {
  const { currentUser } = await verifySession(request)

  const form = await request.formData()
  const accepted = form.get('consent') === 'on'

  if (!accepted) {
    return { error: m.consent_must_accept_error() }
  }

  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? undefined
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

export default function ConsentPage({ actionData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg overflow-hidden shadow-md">
        <div className="h-1 bg-primary" />
        <CardHeader className="items-center space-y-2 text-center">
          <h1 className="font-bold font-display text-2xl tracking-tight">Unitae</h1>
          <p className="text-muted-foreground text-sm">{m.consent_page_subtitle()}</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <p>{m.consent_description_1()}</p>
            <p>{m.consent_description_2()}</p>
            <p>{m.consent_description_3()}</p>
            <p>
              <Link to="/privacy" className="text-primary hover:underline">
                {m.consent_read_privacy_policy()}
              </Link>
            </p>
          </div>

          {actionData?.error && <p className="mt-4 text-destructive text-sm">{actionData.error}</p>}

          <Form method="post" className="mt-6 flex flex-col gap-4">
            <label className="flex items-start gap-3">
              <input type="checkbox" name="consent" value="on" className="mt-1" />
              <span className="text-sm">{m.consent_accept_checkbox()}</span>
            </label>
            <Button type="submit" className="w-full">
              {m.consent_continue()}
            </Button>
          </Form>
        </CardContent>
        <CardFooter className="justify-center">
          <Link to="/logout" className="text-muted-foreground text-sm hover:text-foreground">
            {m.consent_logout()}
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
