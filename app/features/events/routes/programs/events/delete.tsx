import { Form, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { canEditEvent } from '~/features/events/server/programme-auth.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'

import type { Route } from './+types/delete'

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [Role.ProgramManager])

  const eventId = requireParamId(params.eventId, '/congregation/programs')

  return withScope(congregationId, async db => {
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) throw redirect('/congregation/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/congregation/programs')
    }

    return { event }
  })
}

export async function action({ request, params }: Route.ActionArgs) {
  const { currentUser, can, session, congregationId } = await authenticateAndAuthorize(request, [Role.ProgramManager])

  const eventId = requireParamId(params.eventId, '/congregation/programs')

  return withScope(congregationId, async db => {
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) throw redirect('/congregation/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/congregation/programs')
    }

    await db.event.delete({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: eventId, congregationId },
      },
    })

    logger.info(`Deleted event ${eventId}. User ID: ${currentUser.id}.`)
    session.flash('success', m.programs_delete_success({ name: event.name }))

    return redirect('/congregation/programs', {
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
            <Button type="submit" variant="destructive">
              {m.programs_delete_submit()}
            </Button>
          </Form>
        </CardFooter>
      </Card>
    </div>
  )
}
