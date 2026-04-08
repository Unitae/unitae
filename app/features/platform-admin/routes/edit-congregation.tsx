import { Form, redirect } from 'react-router'

import { verifyPlatformAdmin } from '~/features/platform-admin/server/verify-platform-admin.server'
import { unscopedDb } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Separator } from '~/shared/ui/separator'

import type { Route } from './+types/edit-congregation'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Modifier une congregation - Unitae Admin' }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await verifyPlatformAdmin(request)

  const congregation = await unscopedDb.congregation.findUnique({
    where: { id: requireParamId(params.congregationId, '/platform-admin/congregations') },
    include: {
      _count: { select: { users: true, territories: true, buildings: true } },
    },
  })

  if (!congregation) throw redirect('/platform-admin/congregations')

  return {
    congregation: {
      id: congregation.id,
      name: congregation.name,
      slug: congregation.slug,
      domain: congregation.domain,
      displayName: congregation.displayName,
      emailFromName: congregation.emailFromName,
      emailFromAddress: congregation.emailFromAddress,
      baseUrl: congregation.baseUrl,
      locale: congregation.locale,
      timezone: congregation.timezone,
      active: congregation.active,
      stats: congregation._count,
    },
  }
}

export default function EditCongregationPage({ loaderData }: Route.ComponentProps) {
  const { congregation } = loaderData

  return (
    <div className="space-y-6">
      <PageHeader title={congregation.name} />

      <div className="flex gap-3">
        <Badge variant="secondary">{congregation.stats.users} utilisateurs</Badge>
        <Badge variant="secondary">{congregation.stats.territories} territoires</Badge>
        <Badge variant="secondary">{congregation.stats.buildings} batiments</Badge>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Informations generales</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" name="name" type="text" defaultValue={congregation.name} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" name="slug" type="text" defaultValue={congregation.slug} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="domain">Domaine personnalise</Label>
              <Input id="domain" name="domain" type="text" defaultValue={congregation.domain ?? ''} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">Nom d'affichage</Label>
              <Input id="displayName" name="displayName" type="text" defaultValue={congregation.displayName ?? ''} />
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <input
                id="active"
                name="active"
                type="checkbox"
                defaultChecked={congregation.active}
                className="size-4 rounded border-input accent-primary"
              />
              <Label htmlFor="active">Active</Label>
            </div>

            <div className="pt-2">
              <Button type="submit">Enregistrer</Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  await verifyPlatformAdmin(request)

  const form = await request.formData()
  const congregationId = requireParamId(params.congregationId, '/platform-admin/congregations')

  await unscopedDb.congregation.update({
    where: { id: congregationId },
    data: {
      name: String(form.get('name')),
      slug: String(form.get('slug')),
      domain: String(form.get('domain')) || null,
      displayName: String(form.get('displayName')) || null,
      active: form.get('active') === 'on',
    },
  })

  return redirect('/platform-admin/congregations')
}
