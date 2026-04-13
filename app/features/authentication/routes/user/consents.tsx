import { Form, Link, redirect } from 'react-router'
import { type ConsentPurpose, getActiveConsents, withdrawConsent } from '~/features/settings/server/consent.server'
import { AuditAction, audit } from '~/shared/libs/audit.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/consents'

const PURPOSE_LABELS: Record<string, string> = {
  // biome-ignore lint/style/useNamingConvention: database enum values
  DATA_PROCESSING: 'Traitement des données personnelles',
  // biome-ignore lint/style/useNamingConvention: database enum values
  EMAIL_NOTIFICATIONS: 'Notifications par email',
}

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Mes consentements - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, congregationId } = await authenticateAndAuthorize(request)

  return withScope(congregationId, async db => {
    const consents = await getActiveConsents(db, currentUser.id)
    return { consents }
  })
}

export async function action({ request }: Route.ActionArgs) {
  const { currentUser, congregationId } = await authenticateAndAuthorize(request)
  const form = await request.formData()
  const purpose = String(form.get('purpose'))

  await withScope(congregationId, async db => {
    await withdrawConsent(db, currentUser.id, purpose as ConsentPurpose)
  })

  audit({
    action: AuditAction.ConsentWithdrawn,
    congregationId,
    actorId: currentUser.id,
    metadata: { purpose },
  })

  return redirect('/me/consents')
}

export default function ConsentsPage({ loaderData }: Route.ComponentProps) {
  const { consents } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mes consentements" subtitle="Gestion de vos consentements au titre du RGPD." />

      <Card>
        <CardHeader>
          <CardTitle>Consentements actifs</CardTitle>
        </CardHeader>
        <CardContent>
          {consents.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucun consentement actif.</p>
          ) : (
            <div className="divide-y">
              {consents.map(consent => (
                <div key={consent.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="font-medium text-sm">{PURPOSE_LABELS[consent.purpose] ?? consent.purpose}</p>
                    <p className="text-muted-foreground text-xs">
                      Accordé le {new Date(consent.consentedAt).toLocaleDateString('fr-FR')} — version{' '}
                      {consent.consentVersion}
                    </p>
                  </div>
                  <Form method="post">
                    <input type="hidden" name="purpose" value={consent.purpose} />
                    <Button type="submit" variant="outline" size="sm">
                      Retirer
                    </Button>
                  </Form>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Pour en savoir plus sur vos droits, consultez notre{' '}
        <Link to="/privacy" className="underline">
          politique de confidentialité
        </Link>
        .
      </p>
    </div>
  )
}
