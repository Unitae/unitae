import { Form, redirect } from 'react-router'

import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'

import type { Route } from './+types/delete-building'

export async function loader({ request, params }: Route.LoaderArgs) {
  const { can } = await authenticateAndAuthorize(request, [Role.ProspectionManager])
  const canManageProspection = can(Role.ProspectionManager)

  if (!canManageProspection) {
    throw redirect('/')
  }

  const building = await db.building.findUnique({
    where: { id: requireParamId(params.buildingId, '/territories/buildings') },
  })

  if (building == null) {
    throw redirect('/territories/attributions')
  }

  return { building }
}

export default function DeleteBuilding({ loaderData }: Route.ComponentProps) {
  const { building } = loaderData

  return (
    <div className="flex items-center justify-center p-7">
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-center">Supprimer le batiment</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">
            Êtes-vous sûr de vouloir supprimer le batiment au {building.number} {building.street}, {building.zip} ?
            Cette action est irréversible.
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Form method="post">
            <Button type="submit" variant="destructive">
              Supprimer ce batiment
            </Button>
          </Form>
        </CardFooter>
      </Card>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, can } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const building = await db.building.delete({
    where: { id: requireParamId(params.buildingId, '/territories/buildings') },
  })

  session.flash(
    'success',
    `Le batiment au ${building.number} ${building.street}, ${building.zip} a été correctement supprimé`,
  )

  const previousPage = request.headers.get('referer')
  return redirect(previousPage ?? '/territories/buildings', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
