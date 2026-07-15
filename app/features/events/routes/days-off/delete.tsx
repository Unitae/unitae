import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { EventKind } from '~/features/events/model/event-kind.type'
import { deleteDayOff } from '~/features/events/server/days-off.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { DeleteConfirmation } from '~/shared/ui/DeleteConfirmation'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/delete'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Supprimer une absence — Unitae' }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const currentUser = context.get(currentAccountContext)
  logger.info(`Trying to remove days off. User ID: ${currentUser.id}. Event: ${params.eventId}`)

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const event = await db.event.findUnique({
      where: {
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
    <DeleteConfirmation
      title={m.days_off_delete_confirm_title()}
      submitLabel={m.days_off_delete_submit()}
      cancelTo="/me/days-off"
    >
      <p>{event.startDate.toLocaleDateString()}</p>
    </DeleteConfirmation>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const currentUser = context.get(currentAccountContext)
  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const event = await db.event.findUnique({
      where: {
        id_congregationId: { id: requireParamId(params.eventId, '/me/days-off'), congregationId },
      },
      include: { createdBy: true },
    })

    if (currentUser.id !== event?.createdBy.id) {
      session.flash('error', m.days_off_delete_unauthorized())
      logger.warn(`Tried to remove days off of an other user. User ID: ${currentUser.id}. Event: ${params.eventId}.`)

      return redirect('/me/days-off', {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    }

    const deletedEvent = await deleteDayOff(
      db,
      requireParamId(params.eventId, '/me/days-off'),
      currentUser.member?.id ?? null,
      congregationId,
    )

    session.flash('success', m.days_off_delete_success({ date: deletedEvent.startDate.toLocaleDateString() }))
    logger.warn(`Successfully removed days off. User ID: ${currentUser.id}. Event: ${params.eventId}.`)

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/me/days-off', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
