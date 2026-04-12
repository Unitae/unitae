import { Form, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { generateEventsFromTemplate } from '~/features/events/server/programme-generation.server'
import { isTemplateResponsible } from '~/features/events/server/programme-templates.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/generate'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Générer des évènements - Unitae' }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [Role.ProgramManager])

  const templateId = requireParamId(params.templateId, '/congregation/programs')

  return withScope(congregationId, async db => {
    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, congregationId)
    if (!can(Role.ProgramManager) && !responsible) throw redirect('/congregation/programs')

    return { templateId }
  })
}

export async function action({ request, params }: Route.ActionArgs) {
  const { currentUser, can, session, congregationId } = await authenticateAndAuthorize(request, [Role.ProgramManager])

  const templateId = requireParamId(params.templateId, '/congregation/programs')

  return withScope(congregationId, async db => {
    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, congregationId)
    if (!can(Role.ProgramManager) && !responsible) throw redirect('/congregation/programs')

    const events = await generateEventsFromTemplate(db, templateId, 2, currentUser.id, congregationId)

    logger.info(`Generated ${events.length} events from template ${templateId}. User ID: ${currentUser.id}.`)

    session.flash(
      'success',
      events.length > 0
        ? `${events.length} évènement(s) généré(s) pour les 2 prochains mois.`
        : 'Aucun nouvel évènement à générer. Les évènements existent déjà pour cette période.',
    )

    return redirect(`/congregation/programs/templates/${templateId}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

export default function GeneratePage(_props: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Générer des évènements" subtitle="Créer automatiquement les évènements à venir" />

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Confirmer la génération</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Cette action va créer les évènements pour les 2 prochains mois à partir du modèle. Les évènements existants
            ne seront pas dupliqués.
          </p>
        </CardContent>
        <CardFooter>
          <Form method="post">
            <Button type="submit">Générer les évènements</Button>
          </Form>
        </CardFooter>
      </Card>
    </div>
  )
}
