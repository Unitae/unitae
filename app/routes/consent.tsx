import { Form, Link, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import {
  ConsentPurpose,
  hasDataProcessingConsent,
  recordConsentUnscoped,
} from '~/features/settings/server/consent.server'
import { audit, AuditAction } from '~/shared/libs/audit.server'
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
    return { error: 'Vous devez accepter le traitement des données pour utiliser Unitae.' }
  }

  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? undefined
  await recordConsentUnscoped(currentUser.id, currentUser.congregationId, ConsentPurpose.DataProcessing, ip)
  audit({
    action: AuditAction.ConsentGranted,
    congregationId: currentUser.congregationId,
    actorId: currentUser.id,
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
          <p className="text-muted-foreground text-sm">Consentement au traitement des données</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <p>
              Pour utiliser Unitae, votre assemblée locale a besoin de traiter certaines de vos données personnelles :
              nom, prénom, email, et selon votre rôle, vos rapports d'activité et attributions de territoires.
            </p>
            <p>
              Ces données sont des <strong>données de catégorie spéciale</strong> (affiliation religieuse) au sens de
              l'article 9 du RGPD. Elles sont traitées uniquement dans le cadre des activités de votre assemblée locale
              et ne sont pas communiquées en dehors de celle-ci.
            </p>
            <p>
              Vous pouvez à tout moment consulter, exporter ou retirer votre consentement depuis votre profil. Pour
              exercer votre droit à l'effacement, contactez l'administrateur de votre assemblée locale.
            </p>
            <p>
              <Link to="/privacy" className="text-primary hover:underline">
                Lire la politique de confidentialité complète
              </Link>
            </p>
          </div>

          {actionData?.error && <p className="mt-4 text-destructive text-sm">{actionData.error}</p>}

          <Form method="post" className="mt-6 flex flex-col gap-4">
            <label className="flex items-start gap-3">
              <input type="checkbox" name="consent" value="on" className="mt-1" />
              <span className="text-sm">
                J'accepte le traitement de mes données personnelles tel que décrit ci-dessus et dans la{' '}
                <Link to="/privacy" className="text-primary hover:underline">
                  politique de confidentialité
                </Link>
                .
              </span>
            </label>
            <Button type="submit" className="w-full">
              Continuer
            </Button>
          </Form>
        </CardContent>
        <CardFooter className="justify-center">
          <Link to="/logout" className="text-muted-foreground text-sm hover:text-foreground">
            Se déconnecter
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
