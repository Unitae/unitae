import { Form, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'

import type { Route } from './+types/delete'

export async function loader({ request, params }: Route.LoaderArgs) {
  const { can, db } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const territory = await db.territory.findUnique({ where: { id: requireParamId(params.territoryId, '/territories') } })

  if (territory == null) {
    throw redirect('/territories')
  }

  return { territory }
}

export default function DeleteTerritory({ loaderData }: Route.ComponentProps) {
  const { territory } = loaderData

  return (
    <div className="flex items-center justify-center p-7">
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-center">Supprimer le territoire</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">
            Êtes-vous sûr de vouloir supprimer le territoire nº{territory.number} ? Cette action est irréversible.
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Form method="post">
            <Button type="submit" variant="destructive">
              Supprimer le territoire nº{territory.number}
            </Button>
          </Form>
        </CardFooter>
      </Card>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, can, db } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const territory = await db.territory.delete({ where: { id: requireParamId(params.territoryId, '/territories') } })

  session.flash('success', `Le territoire nº${territory.number} a été correctement supprimé`)

  return redirect('/territories', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
