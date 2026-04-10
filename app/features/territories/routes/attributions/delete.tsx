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

  const attribution = await db.attribution.findUnique({
    where: { id: requireParamId(params.attributionId, '/territories/attributions') },
    include: { publisher: true, territory: true },
  })

  if (attribution == null) {
    throw redirect('/territories/attributions')
  }

  return { attribution }
}

export default function DeleteGroup({ loaderData }: Route.ComponentProps) {
  const { attribution } = loaderData

  return (
    <div className="flex items-center justify-center p-7">
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-center">Annuler l'attribution</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">
            Êtes-vous sûr de vouloir annuler l'attribution de {attribution.publisher.firstname} ? Cette action est
            irréversible.
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Form method="post">
            <Button type="submit" variant="destructive">
              Annuler l'attribution du territoire {attribution.territory.number}
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

  const attribution = await db.attribution.delete({
    where: { id: requireParamId(params.attributionId, '/territories/attributions') },
    include: { publisher: true },
  })

  session.flash(
    'success',
    `L'attribution de ${attribution.publisher.lastname?.toLocaleUpperCase()} ${attribution.publisher.firstname} a été annulée`,
  )

  const previousPage = request.headers.get('referer')
  return redirect(previousPage ?? '/territories/attributions', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
