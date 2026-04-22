import { Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { canEditEvent } from '~/features/events/server/programme-auth.server'
import { deleteEvent } from '~/features/events/server/programme-events.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import type { Role } from '~/shared/types/role'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)

  const eventId = requireParamId(params.eventId, '/programs')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Role) => permissions.has(role)
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) throw redirect('/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/programs')
    }

    return { event }
  })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const session = await getSession(request.headers.get('Cookie'))

  const eventId = requireParamId(params.eventId, '/programs')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Role) => permissions.has(role)
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) throw redirect('/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/programs')
    }

    await deleteEvent(db, eventId, congregationId)

    logger.info(`Deleted event ${eventId}. User ID: ${currentUser.id}.`)
    session.flash('success', m.programs_delete_success({ name: event.name }))

    return redirect('/programs', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

export default function DeleteEventPage({ loaderData }: Route.ComponentProps) {
  const { event } = loaderData

  return (
    <div className="flex items-center justify-center p-7">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>{m.programs_delete_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {m.programs_delete_confirm_message({
              name: event.name,
              date: new Date(event.startDate).toLocaleDateString('fr-FR'),
            })}
          </p>
        </CardContent>
        <CardFooter>
          <Form method="post">
            <SubmitButton variant="destructive">{m.programs_delete_submit()}</SubmitButton>
          </Form>
        </CardFooter>
      </Card>
    </div>
  )
}
