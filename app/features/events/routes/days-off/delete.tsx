import { Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { EventKind } from '~/features/events/model/event-kind.type'
import { deleteDayOff } from '~/features/events/server/days-off.server'
import * as m from '~/paraglide/messages'
import logger from '~/shared/infra/logger.server'
import { userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/delete'

export async function loader({ params, context }: Route.LoaderArgs) {
  const currentUser = context.get(userContext)
  logger.info(`Trying to remove days off. User ID: ${currentUser.id}. Event: ${params.eventId}`)

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
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
          <CardTitle>{m.days_off_delete_confirm_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {m.days_off_delete_confirm_message({ date: event.startDate.toLocaleDateString() })}
          </p>
        </CardContent>
        <CardFooter>
          <Form method="post">
            <Button type="submit" variant="destructive">
              {m.days_off_delete_submit()}
            </Button>
          </Form>
        </CardFooter>
      </Card>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const currentUser = context.get(userContext)
  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const event = await db.event.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
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
      currentUser.id,
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
