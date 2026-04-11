import { Form, redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/new-group'

export async function loader({ request }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const canManagePublisher = can(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const brothers = await db.user.findMany({
      where: {
        congregationId,
        // biome-ignore lint/style/useNamingConvention: Prisma OR operator
        OR: [{ isHelder: true }, { isServant: true }],
        responsibleFor: {
          is: null,
        },
        deputyFor: {
          is: null,
        },
      },
    })

    return { brothers }
  })
}

export default function NewGroup({ loaderData }: Route.ComponentProps) {
  const { brothers } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Nouveau groupe" subtitle="Créer un nouveau groupe de prédication" />

      <Card>
        <CardHeader>
          <CardTitle>Informations du groupe</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">Nom</Label>
                <Input id="name" name="name" type="text" placeholder="Nom du groupe" required />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="address">Adresse</Label>
                <Input
                  id="address"
                  name="address"
                  type="text"
                  placeholder="Adresse du groupe de prédication"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="responsible">Responsable</Label>
                <select
                  id="responsible"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  name="responsible"
                  required
                >
                  <option>Choisir un frère responsable de groupe</option>
                  {brothers.map(brother => (
                    <option key={brother.id} value={brother.id}>
                      {brother.firstname} {brother.lastname?.toLocaleUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="deputy">Adjoint</Label>
                <select
                  id="deputy"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  name="deputy"
                >
                  <option value="">Aucun adjoint</option>
                  {brothers.map(brother => (
                    <option key={brother.id} value={brother.id}>
                      {brother.firstname} {brother.lastname?.toLocaleUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button type="submit" className="self-start">
              Créer le groupe
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const previousPage = request.headers.get('referer')
  const canManagePublisher = can(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect(previousPage ?? '/')
  }

  const form = await request.formData()
  const name = form.get('name')
  const address = form.get('address')
  const responsibleId = Number(form.get('responsible'))
  const deputyRaw = form.get('deputy')
  const deputyId = deputyRaw ? Number(deputyRaw) : null

  const session = await getSession(request.headers.get('Cookie'))
  if (name == null || address == null || Number.isNaN(responsibleId)) {
    session.flash('error', 'Veuillez remplir entièrement le formulaire avant soumission')
    throw redirect(previousPage ?? '/congregation/publisher-groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  if (deputyId != null && responsibleId === deputyId) {
    session.flash('error', 'Le responsable de groupe et son adjoint ne peuvent pas être la même personne')
    throw redirect(previousPage ?? '/congregation/publisher-groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  return withScope(congregationId, async db => {
    const membersToConnect = [{ id: responsibleId }]
    if (deputyId != null) membersToConnect.push({ id: deputyId })

    const group = await db.publisherGroup.create({
      data: {
        name: String(name),
        adress: String(address),
        deputyId,
        responsibleId,
        members: { connect: membersToConnect },
        congregationId,
      },
    })

    session.flash('success', `Le groupe de prédication ${group.name} à été créé avec succès`)
    return redirect('/congregation/publisher-groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
