import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { createAttributionSchema } from '~/features/territories/schemas/attribution.schema'
import { aggregateEntrance } from '~/features/territories/server/buildings.server'
import { createAttribution } from '~/features/territories/server/create-attribution.server'
import { TerritoryCardLink } from '~/features/territories/ui/TerritoryCardLink'
import * as m from '~/paraglide/messages'
import {
  congregationContext,
  permissionsContext,
  userContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { Role } from '~/shared/types/role'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.attributions_new_meta_title() }]
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.TerritoriesManager)) {
    throw redirect('/')
  }

  const url = new URL(request.url)
  if (!url.searchParams.has('territory')) {
    throw redirect('/territories/attributions/new/available-territories')
  }

  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const phoneTypeActive = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)

    const territory = await db.territory.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound key
        id_congregationId: { id: Number(url.searchParams.get('territory')), congregationId },
      },
      include: { entrances: { include: { buildings: true } } },
    })

    if (territory === null) {
      throw redirect('/territories/attributions/new/available-territories')
    }

    const users = await db.user.findMany({
      where: {
        isPublisher: true,
        congregationId,
      },
      orderBy: [
        {
          lastname: 'asc',
        },
        { firstname: 'asc' },
      ],
    })

    return { users, phoneTypeActive, territory, territoryEntrances: territory.entrances.map(aggregateEntrance) }
  })
}

export default function CreateAttributionPage({ loaderData }: Route.ComponentProps) {
  const { users, territory, phoneTypeActive, territoryEntrances } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.attributions_new_title()} subtitle={m.attributions_new_subtitle()} />
      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>{m.attributions_new_territory_label()}</Label>
              <input type="hidden" name="territory" value={territory.id} />
              <TerritoryCardLink territory={territory} entrances={territoryEntrances} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{m.attributions_new_publisher_label()}</Label>
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                name="publisher"
                required
              >
                <option disabled>{m.attributions_new_publisher_placeholder()}</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.lastname?.toLocaleUpperCase()} {user.firstname}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{m.attributions_new_type_label()}</Label>
              <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" name="type" required>
                <option value={TerritoryAttributionKind.Default}>
                  {phoneTypeActive ? m.attributions_new_type_default() : m.territories_type_classical_capitalized()}
                </option>
                {!phoneTypeActive && (
                  <option value={TerritoryAttributionKind.Phone}>{m.territories_type_phone_singular()}</option>
                )}
                <option value={TerritoryAttributionKind.Campaign}>{m.attributions_type_campaign()}</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{m.attributions_new_start_date_label()}</Label>
              <Input name="start-date" type="date" defaultValue={new Date().toLocaleDateString('en-CA')} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>
                {m.attributions_new_notes_label()}{' '}
                <span className="text-muted-foreground text-xs">{m.attributions_new_notes_visibility()}</span>
              </Label>
              <textarea
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={4}
                name="notes"
              />
            </div>

            <Button type="submit" className="mt-2">
              {m.attributions_new_submit()}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.TerritoriesManager)) {
    throw redirect('/')
  }

  const submission = parseWithZod(await request.formData(), { schema: createAttributionSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { territory: territoryId, publisher: publisherId, 'start-date': startDate, notes, type } = submission.value
  const congregation = context.get(congregationContext)

  return withScopeFromContext(context, async db => {
    const attribution = await createAttribution(db, {
      publisherId,
      territoryId,
      startDate,
      notes,
      type,
      congregationId: congregation.id,
    })

    return redirect(`/territories/attributions/${attribution.id}/edit`)
  })
}
