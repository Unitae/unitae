import { Form, redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { deleteAttribution } from '~/features/territories/server/delete-attribution.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.TerritoriesManager)) {
    throw redirect('/')
  }

  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const attribution = await db.attribution.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound key
        id_congregationId: { id: requireParamId(params.attributionId, '/territories/attributions'), congregationId },
      },
      include: { publisher: true, territory: true },
    })

    if (attribution == null) {
      throw redirect('/territories/attributions')
    }

    return { attribution }
  })
}

export default function DeleteGroup({ loaderData }: Route.ComponentProps) {
  const { attribution } = loaderData

  return (
    <div className="flex items-center justify-center p-7">
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-center">{m.attributions_delete_card_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">
            {m.attributions_delete_confirm_message({ name: attribution.publisher.firstname ?? '' })}
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Form method="post">
            <Button type="submit" variant="destructive">
              {m.attributions_delete_submit({ number: String(attribution.territory.number) })}
            </Button>
          </Form>
        </CardFooter>
      </Card>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.TerritoriesManager)) {
    throw redirect('/')
  }

  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    const attribution = await deleteAttribution(
      db,
      requireParamId(params.attributionId, '/territories/attributions'),
      congregationId,
    )

    session.flash(
      'success',
      m.attributions_delete_flash_success({
        name: `${attribution.publisher.lastname?.toLocaleUpperCase()} ${attribution.publisher.firstname}`,
      }),
    )

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/territories/attributions', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
