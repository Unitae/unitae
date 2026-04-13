import { Form, redirect } from 'react-router'

import * as m from '~/paraglide/messages'
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
  return [{ title: m.platform_admin_edit_congregation_meta_title() }]
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
        <Badge variant="secondary">{m.platform_admin_edit_congregation_users({ count: congregation.stats.users })}</Badge>
        <Badge variant="secondary">{m.platform_admin_edit_congregation_territories({ count: congregation.stats.territories })}</Badge>
        <Badge variant="secondary">{m.platform_admin_edit_congregation_buildings({ count: congregation.stats.buildings })}</Badge>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{m.platform_admin_edit_congregation_general_info()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{m.platform_admin_edit_congregation_name_label()}</Label>
              <Input id="name" name="name" type="text" defaultValue={congregation.name} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">{m.platform_admin_edit_congregation_slug_label()}</Label>
              <Input id="slug" name="slug" type="text" defaultValue={congregation.slug} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="domain">{m.platform_admin_edit_congregation_domain_label()}</Label>
              <Input id="domain" name="domain" type="text" defaultValue={congregation.domain ?? ''} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">{m.platform_admin_edit_congregation_display_name_label()}</Label>
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
              <Label htmlFor="active">{m.platform_admin_edit_congregation_active_label()}</Label>
            </div>

            <div className="pt-2">
              <Button type="submit">{m.common_save()}</Button>
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
