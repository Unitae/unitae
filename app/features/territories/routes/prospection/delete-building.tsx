import { Form, redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { deleteBuilding } from '~/features/territories/server/delete-building.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete-building'

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.ProspectionManager)) {
    throw redirect('/')
  }

  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const building = await db.building.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound key
        id_congregationId: { id: requireParamId(params.buildingId, '/territories/buildings'), congregationId },
      },
    })

    if (building == null) {
      throw redirect('/territories/attributions')
    }

    return { building }
  })
}

export default function DeleteBuilding({ loaderData }: Route.ComponentProps) {
  const { building } = loaderData

  return (
    <div className="flex items-center justify-center p-7">
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-center">{m.prospection_delete_building_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">
            {m.prospection_delete_building_confirm({
              address: `${building.number} ${building.street}, ${building.zip}`,
            })}
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Form method="post">
            <Button type="submit" variant="destructive">
              {m.prospection_delete_building_submit()}
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
    const building = await deleteBuilding(
      db,
      requireParamId(params.buildingId, '/territories/buildings'),
      congregationId,
    )

    session.flash(
      'success',
      m.prospection_delete_building_flash_success({
        address: `${building.number} ${building.street}, ${building.zip}`,
      }),
    )

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/territories/buildings', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
