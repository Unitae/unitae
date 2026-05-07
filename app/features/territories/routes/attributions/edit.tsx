import { getFormProps, getInputProps, useForm } from '@conform-to/react'
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
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, requirePermission, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { Permission } from '~/shared/types/permission'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { PersonDropdown } from '~/shared/ui/PersonDropdown'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.attributions_edit_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesManager)

  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const phoneTypeActive = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)

    const attribution = await db.attribution.findUnique({
      where: {
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

export default function EditAttributionPage({ loaderData, actionData }: Route.ComponentProps) {
  const { users, attribution, phoneTypeActive, entrances } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()
  const [shouldShowEndDate, showEndDate] = useState(false)
  useFocusError(actionData)
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: updateAttributionSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.attributions_edit_title()}
        subtitle={m.attributions_edit_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_attributions(), to: '/territories/attributions' },
          { label: m.attributions_edit_title() },
        ]}
        backTo="/territories/attributions"
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
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4" onChange={markDirty}>
            <div className="flex flex-col gap-1.5">
              <Label>{m.attributions_new_territory_label()}</Label>
              <input type="hidden" name="territory" value={attribution.territory.id} />
              <TerritoryCardLink territory={attribution.territory} entrances={entrances} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={fields.publisher.id}>{m.attributions_new_publisher_label()}</Label>
              <PersonDropdown
                id={fields.publisher.id}
                name={fields.publisher.name}
                people={users}
                defaultValue={String(attribution.publisherId)}
                placeholder={m.attributions_new_publisher_placeholder()}
                allowNone={false}
                disabled={attribution.endDate !== null}
                aria-invalid={fields.publisher.errors !== undefined}
              />
              {fields.publisher.errors && <p className="text-destructive text-sm">{fields.publisher.errors}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={fields.type.id}>{m.attributions_edit_type_label()}</Label>
              <Select name={fields.type.name} defaultValue={attribution.type} disabled={attribution.endDate !== null}>
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
                  <SelectItem value={TerritoryAttributionKind.Campaign}>{m.attributions_type_campaign()}</SelectItem>
                </SelectContent>
              </Select>
              {fields.type.errors && <p className="text-destructive text-sm">{fields.type.errors}</p>}
            </div>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={fields['start-date'].id}>{m.attributions_edit_start_date_label()}</Label>
                <Input
                  {...getInputProps(fields['start-date'], { type: 'date' })}
                  defaultValue={attribution.startDate.toLocaleDateString('en-CA')}
                  readOnly
                />
              </div>
              {attribution.endDate || shouldShowEndDate ? (
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor={fields['end-date'].id} className={attribution.endDate ? '' : 'text-destructive'}>
                    {m.attributions_edit_end_date_label()}
                  </Label>
                  <Input
                    {...getInputProps(fields['end-date'], { type: 'date' })}
                    className={attribution.endDate ? '' : 'border-destructive'}
                    defaultValue={
                      attribution.endDate?.toLocaleDateString('en-CA') ?? new Date().toLocaleDateString('en-CA')
                    }
                    max={new Date().toLocaleDateString('en-CA')}
                    readOnly={attribution.endDate !== null}
                  />
                </div>
              ) : (
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor={fields['late-date'].id}>{m.attributions_edit_late_date_label()}</Label>
                  <Input
                    {...getInputProps(fields['late-date'], { type: 'date' })}
                    defaultValue={attribution.lateDate?.toLocaleDateString('en-CA')}
                    disabled={attribution.endDate !== null}
                  />
                </div>
              )}
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
                readOnly={attribution.endDate !== null}
              >
                {attribution.notes}
              </textarea>
              {fields.notes.errors && <p className="text-destructive text-sm">{fields.notes.errors}</p>}
            </div>

            {shouldShowEndDate ? (
              <Button variant="destructive" type="submit" disabled={attribution.endDate !== null} className="mt-2">
                {m.attributions_edit_return_submit()}
              </Button>
            ) : (
              <SubmitButton disabled={attribution.endDate !== null} className="mt-2">
                {m.attributions_edit_save_submit()}
              </SubmitButton>
            )}
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesManager)

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
  const { congregationId, id: actorId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const attribution = await updateAttribution(
      db,
      requireParamId(params.attributionId, '/territories/attributions'),
      congregationId,
      actorId,
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
