import { Form, redirect } from 'react-router'

import { commitSession } from '~/features/authentication/server/session.server'
import { EventKind } from '~/features/events/model/event-kind.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'
import type { Route } from './+types/delete'

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser, congregationId } = await authenticateAndAuthorize(request)
  logger.info(`Trying to remove days off. User ID: ${currentUser.id}. Event: ${params.eventId}`)

  return withScope(congregationId, async db => {
    const event = await db.event.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: requireParamId(params.eventId, '/me/days-off'), congregationId },
        kind: { key: EventKind.Off },
      },
      include: { createdBy: true },
    })

    if (event?.createdBy?.id !== currentUser.id) {
      throw redirect('/me/days-off')
    }

    return { event }
  })
}

export default function DeleteDayOff({ loaderData }: Route.ComponentProps) {
  const { event } = loaderData

  return (
    <div className="flex items-center justify-center p-7">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Supprimer l'absence</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Êtes-vous sûr de vouloir supprimer l'absence du {event.startDate.toLocaleDateString()} ? Cette action est
            irréversible.
          </p>
        </CardContent>
        <CardFooter>
          <Form method="post">
            <Button type="submit" variant="destructive">
              Supprimer l'absence
            </Button>
          </Form>
        </CardFooter>
      </Card>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, currentUser, congregationId } = await authenticateAndAuthorize(request)

  return withScope(congregationId, async db => {
    const event = await db.event.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: requireParamId(params.eventId, '/me/days-off'), congregationId },
      },
      include: { createdBy: true },
    })

    if (currentUser.id !== event?.createdBy.id) {
      session.flash('error', "Vous n'êtes pas autorisé à annuler cette absence.")
      logger.warn(`Tried to remove days off of an other user. User ID: ${currentUser.id}. Event: ${params.eventId}.`)

      return redirect('/me/days-off', {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    }

    const deletedEvent = await db.event.delete({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: requireParamId(params.eventId, '/me/days-off'), congregationId },
      },
    })

    session.flash('success', `L'absence du ${deletedEvent.startDate.toLocaleDateString()} a été supprimée avec succès.`)
    logger.warn(`Successfully removed days off. User ID: ${currentUser.id}. Event: ${params.eventId}.`)

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/me/days-off', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
