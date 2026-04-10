import { Form, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db, restoreCongregationContext } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'

import type { Route } from './+types/delete'

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  if (!canManageBoard) {
    throw redirect('/')
  }

  restoreCongregationContext(currentUser.congregationId)
  const section = await db.boardSection.findUnique({ where: { id: requireParamId(params.sectionId, '/board') } })

  if (section == null) {
    throw redirect('/board/sections')
  }

  return { section }
}

export default function DeleteSectionPage({ loaderData }: Route.ComponentProps) {
  const { section } = loaderData

  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="flex flex-col items-center justify-center gap-6 pt-6">
        <p className="text-center text-muted-foreground">
          Êtes-vous sûr de vouloir supprimer la section "{section.name}" ? Cette action est irréversible.
        </p>
        <Form method="post">
          <Button type="submit" variant="destructive" title="Supprimer la section définitivement">
            Supprimer la section
          </Button>
        </Form>
      </CardContent>
    </Card>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, currentUser } = await verifySession(request)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  if (!canManageBoard) {
    throw redirect('/')
  }

  restoreCongregationContext(currentUser.congregationId)
  const section = await db.boardSection.delete({ where: { id: requireParamId(params.sectionId, '/board') } })

  session.flash('success', `La section "${section.name}" a été correctement supprimée`)

  return redirect('/board/sections', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
