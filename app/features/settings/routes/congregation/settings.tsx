import { ArrowRight } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getBoolSetting, setSetting } from '~/features/settings/server/settings'
import { db, unscopedDb } from '~/shared/libs/db.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { PublisherType } from '~/shared/types/publisher-type'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Checkbox } from '~/shared/ui/checkbox'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import type { Route } from './+types/settings'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Paramètres du module Assemblée - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { congregation } = await verifySession(request)
  const canManageSettings = await verifyRole(request, Role.Admin)

  if (!canManageSettings) {
    throw redirect('/')
  }

  const auxiliaryPioneerProfileActivated = await getBoolSetting(CongregationSettingKey.AuxiliaryPioneerProfileActivated)

  return {
    auxiliaryPioneerProfileActivated: auxiliaryPioneerProfileActivated ?? false,
    congregationDisplayName: congregation.displayName,
  }
}

export default function BuildingSettingsPage({ loaderData }: Route.ComponentProps) {
  const { auxiliaryPioneerProfileActivated, congregationDisplayName } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Assemblée" subtitle='Paramètres du module "Assemblée"' />

      <Form method="post" className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Congrégation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="displayName">Nom affiché</Label>
              <Input
                id="displayName"
                name="displayName"
                type="text"
                placeholder="Nom affiché de la congrégation"
                defaultValue={congregationDisplayName}
              />
              <p className="text-muted-foreground text-xs">
                Ce nom est utilisé dans l'interface et dans les emails envoyés par l'application.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Proclamateurs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Checkbox
                id="auxiliary-pioneer"
                name={CongregationSettingKey.AuxiliaryPioneerProfileActivated}
                value="on"
                defaultChecked={auxiliaryPioneerProfileActivated}
              />
              <Label htmlFor="auxiliary-pioneer" className="font-normal">
                Activer le profil <span className="font-bold text-primary">Pionnier Auxiliaire</span> sur la fiche du
                proclamateur.
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Programmes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-5 rounded-lg border p-4">
              <span className="text-sm">Types d'évènements</span>
              <Button variant="ghost" size="sm" asChild>
                <Link to="./event-kinds" className="flex items-center gap-2">
                  Voir tout <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Button type="submit">Enregistrer</Button>
      </Form>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { congregation } = await verifySession(request)
  const canManageSettings = await verifyRole(request, Role.Admin)

  if (!canManageSettings) {
    throw redirect('/')
  }

  const form = await request.formData()
  const displayName = form.get('displayName')
  const auxiliaryPioneerProfileActivated = String(
    Boolean(form.get(CongregationSettingKey.AuxiliaryPioneerProfileActivated)),
  )

  await unscopedDb.congregation.update({
    where: { id: congregation.id },
    data: { displayName: displayName ? String(displayName) : null },
  })

  await setSetting(CongregationSettingKey.AuxiliaryPioneerProfileActivated, auxiliaryPioneerProfileActivated, congregation.id)
  if (auxiliaryPioneerProfileActivated === 'false') {
    await db.user.updateMany({
      where: {
        type: PublisherType.PionnierAuxiliaires,
      },
      data: {
        type: PublisherType.Normal,
      },
    })
  }

  return redirect('/settings')
}
