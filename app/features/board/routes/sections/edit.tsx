import { Trash2 } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db, restoreCongregationContext } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Modification d'une section du Tableau d'affichage - Unitae` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  if (!canManageBoard) {
    throw redirect('/')
  }

  restoreCongregationContext(currentUser.congregationId)
  const section = await db.boardSection.findUnique({
    where: {
      id: requireParamId(params.sectionId, '/board'),
    },
  })

  if (section == null) throw redirect('/board/sections')

  return { section }
}

export default function EditSectionPage({ loaderData }: Route.ComponentProps) {
  const { section } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Modification d'une section"
        subtitle="Modifier une section du tableau d'affichage"
        actions={
          <Button variant="destructive" size="icon" asChild>
            <Link to={`/board/sections/${section.id}/delete`} title="Supprimer complètement la section">
              <Trash2 className="size-4" />
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nom</Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="Nom de la section"
                defaultValue={section.name ?? ''}
              />
            </div>
            <Button type="submit" className="w-fit">
              Modifier la section
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, currentUser } = await verifySession(request)
  const form = await request.formData()
  const name = String(form.get('name'))

  if (name.length < 1) {
    session.flash('error', 'Vous devez remplir tous les champs du formulaire. Réessayez.')
    throw redirect('/board/sections/new')
  }

  restoreCongregationContext(currentUser.congregationId)
  const section = await db.boardSection.update({
    where: {
      id: requireParamId(params.sectionId, '/board'),
    },
    data: {
      name: String(name),
    },
  })

  if (section == null) {
    session.flash('error', `Quelque chose s'est mal passé. Réessayez.`)

    return redirect('/board', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  session.flash('success', `Section "${section.name}" modifiée avec succès.`)

  return redirect(`/board/sections/${section.id}/edit`, {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
