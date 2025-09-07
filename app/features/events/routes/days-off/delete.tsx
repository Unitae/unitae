import { Form, redirect } from 'react-router'

import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { EventKind } from '~/features/events/model/event-kind.type'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import type { Route } from './+types/delete'

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)

  logger.info(`Trying to remove days off. User ID: ${currentUser.id}. Event: ${params.eventId}`)

  const event = await db.event.findUnique({
    where: { id: requireParamId(params.eventId, '/me/days-off'), kind: { key: EventKind.Off } },
    include: { createdBy: true },
  })

  if (event?.createdBy?.id !== currentUser.id) {
    throw redirect('/me/days-off')
  }

  return { event }
}

export default function DeleteGroup({ loaderData }: Route.ComponentProps) {
  const { event } = loaderData

  return (
    <div className="flex flex-col items-center justify-center gap-7 p-7">
      <p className="text-center">
        Êtes-vous sûr de vouloir supprimer l'absence du {event.startDate.toLocaleDateString()} ? Cette action est
        irréversible.
      </p>
      <Form method="post">
        <button
          type="submit"
          title="Annuler l'attribution du territoire"
          className={'rounded-lg bg-red-600 p-3 font-semibold text-white hover:bg-red-900 max-sm:p-2'}
        >
          Supprimer l'absence
        </button>
      </Form>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, currentUser } = await verifySession(request)

  const event = await db.event.findUnique({
    where: { id: requireParamId(params.eventId, '/me/days-off') },
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
    where: { id: requireParamId(params.eventId, '/me/days-off') },
  })

  session.flash('success', `L'absence du ${deletedEvent.startDate.toLocaleDateString()} a été supprimée avec succès.`)
  logger.warn(`Successfully removed days off. User ID: ${currentUser.id}. Event: ${params.eventId}.`)

  const previousPage = request.headers.get('referer')
  return redirect(previousPage ?? '/me/days-off', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
