import { Form, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { db } from '~/shared/libs/db.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Création de section sur Tableau d'affichage - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { can } = await authenticateAndAuthorize(request, [Role.BoardValidator])
  const canManageBoard = can(Role.BoardValidator)

  if (!canManageBoard) {
    throw redirect('/')
  }

  return null
}

export default function NewSectionPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Nouvelle section" subtitle="Créer une nouvelle section sur le tableau d'affichage" />

      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" name="name" type="text" placeholder="Nom de la section" />
            </div>
            <Button type="submit" className="w-fit">
              Créer la section
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { session, congregation } = await authenticateAndAuthorize(request)
  const form = await request.formData()
  const name = String(form.get('name'))

  if (name.length < 1) {
    session.flash('error', 'Vous devez remplir tous les champs du formulaire. Réessayez.')
    throw redirect('/board/sections/new')
  }

  const section = await db.boardSection.create({
    data: {
      name: String(name),
      congregationId: congregation.id,
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

  session.flash('success', `Section "${section.name}" créée avec succès.`)

  return redirect(`/board/sections/${section.id}/edit`, {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
