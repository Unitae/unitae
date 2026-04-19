import { parseWithZod } from '@conform-to/zod'
import { ArrowDownToLine, X } from 'lucide-react'
import { useState } from 'react'
import { data, Form, redirect } from 'react-router'
import { getPublishers } from '~/features/publishers/server/publishers.server'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { updateAttributionSchema } from '~/features/territories/schemas/attribution.schema'
import { aggregateEntrance } from '~/features/territories/server/buildings.server'
import { updateAttribution } from '~/features/territories/server/update-attribution.server'
import { TerritoryCardLink } from '~/features/territories/ui/TerritoryCardLink'
import * as m from '~/paraglide/messages'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.attributions_edit_meta_title() }]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.TerritoriesManager)) {
    throw redirect('/')
  }

  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const phoneTypeActive = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)

    const attribution = await db.attribution.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound key
        id_congregationId: { id: requireParamId(params.attributionId, '/territories/attributions'), congregationId },
      },
      include: { territory: { include: { entrances: { include: { buildings: true } } } }, publisher: true },
    })

    if (attribution == null) {
      throw redirect('/territories/attributions')
    }

    const users = await getPublishers(db, congregationId)

    return { users, phoneTypeActive, attribution, entrances: attribution.territory.entrances.map(aggregateEntrance) }
  })
}

export default function EditAttributionPage({ loaderData }: Route.ComponentProps) {
  const { users, attribution, phoneTypeActive, entrances } = loaderData
  const [shouldShowEndDate, showEndDate] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.attributions_edit_title()}
        subtitle={m.attributions_edit_subtitle()}
        actions={
          attribution.endDate === null && (
            <>
              <Button
                variant={shouldShowEndDate ? 'default' : 'outline'}
                size="icon"
                title={m.attributions_edit_return_territory_title()}
                type="button"
                onClick={() => showEndDate(state => !state)}
              >
                <ArrowDownToLine className="size-4" />
              </Button>
              <Button variant="destructive" size="sm" asChild>
                <a href={`./${attribution.id}/delete`} title={m.attributions_cancel_title()}>
                  <X className="size-4" />
                </a>
              </Button>
            </>
          )
        }
      />
      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>{m.attributions_new_territory_label()}</Label>
              <input type="hidden" name="territory" value={attribution.territory.id} />
              <TerritoryCardLink territory={attribution.territory} entrances={entrances} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{m.attributions_new_publisher_label()}</Label>
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                name="publisher"
                required
                defaultValue={String(attribution.publisherId)}
                disabled={attribution.endDate !== null}
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
              <Label>{m.attributions_edit_type_label()}</Label>
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                name="type"
                required
                defaultValue={attribution.type}
                disabled={attribution.endDate !== null}
              >
                <option value={TerritoryAttributionKind.Default}>
                  {phoneTypeActive ? m.attributions_new_type_default() : m.territories_type_classical_capitalized()}
                </option>
                {!phoneTypeActive && (
                  <option value={TerritoryAttributionKind.Phone}>{m.territories_type_phone_singular()}</option>
                )}
                <option value={TerritoryAttributionKind.Campaign}>{m.attributions_type_campaign()}</option>
              </select>
            </div>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>{m.attributions_edit_start_date_label()}</Label>
                <Input
                  name="start-date"
                  type="date"
                  defaultValue={attribution.startDate.toLocaleDateString('en-CA')}
                  readOnly
                />
              </div>
              {attribution.endDate || shouldShowEndDate ? (
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label className={attribution.endDate ? '' : 'text-destructive'}>
                    {m.attributions_edit_end_date_label()}
                  </Label>
                  <Input
                    className={attribution.endDate ? '' : 'border-destructive'}
                    name="end-date"
                    type="date"
                    defaultValue={
                      attribution.endDate?.toLocaleDateString('en-CA') ?? new Date().toLocaleDateString('en-CA')
                    }
                    max={new Date().toLocaleDateString('en-CA')}
                    readOnly={attribution.endDate !== null}
                  />
                </div>
              ) : (
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label>{m.attributions_edit_late_date_label()}</Label>
                  <Input
                    name="late-date"
                    type="date"
                    defaultValue={attribution.lateDate?.toLocaleDateString('en-CA')}
                    disabled={attribution.endDate !== null}
                  />
                </div>
              )}
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
                readOnly={attribution.endDate !== null}
              >
                {attribution.notes}
              </textarea>
            </div>

            {shouldShowEndDate ? (
              <Button variant="destructive" type="submit" disabled={attribution.endDate !== null} className="mt-2">
                {m.attributions_edit_return_submit()}
              </Button>
            ) : (
              <Button type="submit" disabled={attribution.endDate !== null} className="mt-2">
                {m.attributions_edit_save_submit()}
              </Button>
            )}
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.TerritoriesManager)) {
    throw redirect('/')
  }

  const submission = parseWithZod(await request.formData(), { schema: updateAttributionSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { publisher: publisherId, notes, type } = submission.value
  const startDateText = submission.value['start-date']
  const lateDateText = submission.value['late-date']
  const endDateText = submission.value['end-date']

  const hasLateDate = lateDateText.length > 0 && lateDateText !== 'null'
  const hasEndDate = endDateText.length > 0 && endDateText !== 'null'
  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const attribution = await updateAttribution(
      db,
      requireParamId(params.attributionId, '/territories/attributions'),
      congregationId,
      {
        publisherId,
        notes,
        type,
        startDate: new Date(startDateText),
        lateDate: hasLateDate ? new Date(lateDateText) : undefined,
        endDate: hasEndDate ? new Date(endDateText) : undefined,
      },
    )

    return redirect(hasEndDate ? '/territories/attributions' : `/territories/attributions/${attribution.id}/edit`)
  })
}
