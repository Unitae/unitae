import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { createAttributionSchema } from '~/features/territories/schemas/attribution.schema'
import { aggregateEntrance } from '~/features/territories/server/buildings.server'
import { getActiveCampaign } from '~/features/territories/server/campaign.queries'
import { createAttribution } from '~/features/territories/server/create-attribution.server'
import { AttributionKindBadge } from '~/features/territories/ui/AttributionKindBadge'
import { TerritoryCardLink } from '~/features/territories/ui/TerritoryCardLink'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Card, CardContent } from '~/shared/ui/card'
import { FormActions } from '~/shared/ui/FormActions'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { PersonDropdown } from '~/shared/ui/PersonDropdown'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.attributions_new_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesManager)

  const url = new URL(request.url)
  if (!url.searchParams.has('territory')) {
    throw redirect('/territories/attributions/new/available-territories')
  }

  const { congregationId } = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    const phoneTypeActive = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)

    const activeCampaign = await getActiveCampaign(db, congregationId)

    const territory = await db.territory.findUnique({
      where: {
        id_congregationId: { id: Number(url.searchParams.get('territory')), congregationId },
      },
      include: { entrances: { include: { buildings: true } } },
    })

    if (territory === null) {
      throw redirect('/territories/attributions/new/available-territories')
    }

    const users = await db.member.findMany({
      where: {
        isPublisher: true,
        leftAt: null,
        congregationId,
      },
      orderBy: [
        {
          lastname: 'asc',
        },
        { firstname: 'asc' },
      ],
    })

    return {
      users,
      phoneTypeActive,
      territory,
      territoryEntrances: territory.entrances.map(aggregateEntrance),
      activeCampaign:
        activeCampaign == null
          ? null
          : { id: activeCampaign.id, name: activeCampaign.name, endDate: activeCampaign.endDate },
    }
  })
}

export default function CreateAttributionPage({ loaderData, actionData }: Route.ComponentProps) {
  const { users, territory, phoneTypeActive, territoryEntrances, activeCampaign } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()
  useFocusError(actionData)
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: createAttributionSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.attributions_new_title()}
        subtitle={m.attributions_new_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_attributions(), to: '/territories/attributions' },
          { label: m.attributions_new_title() },
        ]}
        backTo="/territories/attributions"
      />
      {activeCampaign != null && (
        <div className="rounded-md bg-blue-100 px-4 py-3 text-blue-700 text-sm dark:bg-blue-900/30 dark:text-blue-400">
          {m.attributions_campaign_mode_notice({
            name: activeCampaign.name,
            endDate: new Date(activeCampaign.endDate).toLocaleDateString('fr-FR'),
          })}
        </div>
      )}
      <Card>
        <CardContent className="pt-6">
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4" onChange={markDirty}>
            <div className="flex flex-col gap-1.5">
              <Label>{m.attributions_new_territory_label()}</Label>
              <input type="hidden" name={fields.territory.name} value={territory.id} />
              <TerritoryCardLink territory={territory} entrances={territoryEntrances} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={fields.publisher.id}>{m.attributions_new_publisher_label()}</Label>
              <PersonDropdown
                id={fields.publisher.id}
                name={fields.publisher.name}
                people={users}
                placeholder={m.attributions_new_publisher_placeholder()}
                allowNone={false}
                aria-invalid={fields.publisher.errors !== undefined}
              />
              {fields.publisher.errors && <p className="text-destructive text-sm">{fields.publisher.errors}</p>}
            </div>
            {activeCampaign != null ? (
              <div className="flex flex-col gap-1.5">
                <input type="hidden" name={fields.type.name} value={TerritoryAttributionKind.Default} />
                <Label>{m.attributions_new_type_label()}</Label>
                <div>
                  <AttributionKindBadge type={TerritoryAttributionKind.Default} campaignName={activeCampaign.name} />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={fields.type.id}>{m.attributions_new_type_label()}</Label>
                <Select name={fields.type.name} defaultValue={TerritoryAttributionKind.Default}>
                  <SelectTrigger id={fields.type.id} className="w-full" aria-invalid={fields.type.errors !== undefined}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TerritoryAttributionKind.Default}>
                      {phoneTypeActive ? m.attributions_new_type_default() : m.territories_type_classical_capitalized()}
                    </SelectItem>
                    {!phoneTypeActive && (
                      <SelectItem value={TerritoryAttributionKind.Phone}>
                        {m.territories_type_phone_singular()}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {fields.type.errors && <p className="text-destructive text-sm">{fields.type.errors}</p>}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={fields['start-date'].id}>{m.attributions_new_start_date_label()}</Label>
              <Input
                {...getInputProps(fields['start-date'], { type: 'date' })}
                defaultValue={new Date().toLocaleDateString('en-CA')}
              />
              {fields['start-date'].errors && <p className="text-destructive text-sm">{fields['start-date'].errors}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={fields.notes.id}>
                {m.attributions_new_notes_label()}{' '}
                <span className="text-muted-foreground text-xs">{m.attributions_new_notes_visibility()}</span>
              </Label>
              <textarea
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={4}
                id={fields.notes.id}
                name={fields.notes.name}
              />
              {fields.notes.errors && <p className="text-destructive text-sm">{fields.notes.errors}</p>}
            </div>

            <FormActions>
              <SubmitButton>{m.attributions_new_submit()}</SubmitButton>
            </FormActions>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesManager)

  const submission = parseWithZod(await request.formData(), { schema: createAttributionSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { territory: territoryId, publisher: publisherId, 'start-date': startDate, notes, type } = submission.value
  const congregation = context.get(congregationContext)
  const { id: actorId } = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    try {
      // While a campaign is active the aggregate rejects regular attributions,
      // so the action steers the assignment into the campaign instead.
      const activeCampaign = await getActiveCampaign(db, congregation.id)
      const attribution = await createAttribution(db, {
        publisherId,
        territoryId,
        startDate,
        notes,
        type,
        campaignId: activeCampaign?.id ?? null,
        congregationId: congregation.id,
        actorId,
      })

      return redirect(`/territories/attributions/${attribution.id}/edit`)
    } catch (err) {
      if (err instanceof ConflictError && err.message === 'attribution_overlap') {
        return data(submission.reply({ formErrors: [m.attributions_overlap_error()] }), { status: 409 })
      }
      if (err instanceof ConflictError && err.message === 'campaign_mode_active') {
        return data(submission.reply({ formErrors: [m.attributions_campaign_mode_error()] }), { status: 409 })
      }
      if (err instanceof ConflictError && err.message === 'campaign_not_active') {
        return data(submission.reply({ formErrors: [m.attributions_campaign_not_active_error()] }), { status: 409 })
      }
      throw err
    }
  })
}
