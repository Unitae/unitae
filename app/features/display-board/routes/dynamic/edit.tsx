import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { Trash2 } from 'lucide-react'
import { data, Form, Link, redirect } from 'react-router'
import type { Prisma } from '~/database/generated/client'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { DynamicType, isDynamicType } from '~/features/display-board/model/dynamic-document.type'
import { parseAppearance } from '~/features/display-board/schemas/appearance.schema'
import { updateDynamicDocumentSchema } from '~/features/display-board/schemas/board-document.schema'
import { validateVisibilityDates } from '~/features/display-board/server/file-validation.server'
import { updateDynamicDocument } from '~/features/display-board/server/update-dynamic-document.server'
import { AppearanceFields } from '~/features/display-board/ui/dynamic/AppearanceFields'
import { BOARD_WEB_FONTS_HREF } from '~/features/display-board/ui/dynamic/board-web-fonts'
import { ProgrammeConfigFields } from '~/features/display-board/ui/dynamic/ProgrammeConfigFields'
import { getTemplates } from '~/features/events/index.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { FormActions } from '~/shared/ui/FormActions'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.board_dynamic_edit_meta_title() }]
}

// The typeface samples of the appearance card are set in the faces themselves.
export const links: Route.LinksFunction = () => [{ rel: 'stylesheet', href: BOARD_WEB_FONTS_HREF }]

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageDynamicBoardDocuments)

  const dynamicId = requireParamId(params.dynamicId, '/board')

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const settings = await db.boardDynamicDocumentSettings.findUnique({
      where: {
        id_congregationId: { id: dynamicId, congregationId },
      },
    })

    if (!settings) throw redirect('/board/documents')

    const sections = await db.boardSection.findMany({
      where: { congregationId },
      orderBy: { order: 'asc' },
    })

    // Load templates for programme config grid
    const templates = settings.dynamicType === DynamicType.Programme ? await getTemplates(db, congregationId) : []

    const appearance = isDynamicType(settings.dynamicType)
      ? { type: settings.dynamicType, ...parseAppearance(settings.dynamicType, settings.appearance) }
      : null

    return { settings, sections, templates, appearance }
  })
}

export default function EditDynamicDocumentPage({ loaderData, actionData }: Route.ComponentProps) {
  const { settings, sections, templates, appearance } = loaderData
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: updateDynamicDocumentSchema })
    },
  })

  const { blocker, markDirty } = useUnsavedChanges()

  let formattedVisibleFrom = ''
  if (settings.visibleFrom !== null) {
    const visibleFrom = new Date(settings.visibleFrom)
    visibleFrom.setMinutes(visibleFrom.getMinutes() - visibleFrom.getTimezoneOffset())
    formattedVisibleFrom = visibleFrom.toISOString().slice(0, 16)
  }

  let formattedVisibleUntil = ''
  if (settings.visibleUntil !== null) {
    const visibleUntil = new Date(settings.visibleUntil)
    visibleUntil.setMinutes(visibleUntil.getMinutes() - visibleUntil.getTimezoneOffset())
    formattedVisibleUntil = visibleUntil.toISOString().slice(0, 16)
  }

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.board_dynamic_edit_title()}
        subtitle={m.board_dynamic_edit_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_documents(), to: '/board/documents' },
          { label: m.board_dynamic_edit_title() },
        ]}
        backTo="/board/documents"
        actions={
          <Button variant="destructive" size="icon" asChild>
            <Link to={`/board/dynamic/${settings.id}/delete`} title={m.board_dynamic_delete_tooltip()}>
              <Trash2 className="size-4" />
            </Link>
          </Button>
        }
      />

      <Form method="post" {...getFormProps(form)} className="flex flex-col gap-6" onChange={markDirty}>
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.title.id}>{m.board_documents_new_name_label()}</Label>
              <Input
                {...getInputProps(fields.title, { type: 'text' })}
                defaultValue={settings.title}
                autoComplete="off"
              />
              {fields.title.errors && <p className="text-destructive text-sm">{fields.title.errors}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.sectionId.id}>{m.board_documents_new_section_label()}</Label>
              <Select name={fields.sectionId.name} defaultValue={String(settings.sectionId)}>
                <SelectTrigger
                  id={fields.sectionId.id}
                  className="w-full"
                  aria-invalid={fields.sectionId.errors !== undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sections.map(section => (
                    <SelectItem key={section.id} value={String(section.id)}>
                      {section.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fields.sectionId.errors && <p className="text-destructive text-sm">{fields.sectionId.errors}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor={fields['visible-from'].id}>{m.board_documents_new_visible_from_label()}</Label>
                <Input
                  {...getInputProps(fields['visible-from'], {
                    type: 'datetime-local',
                  })}
                  defaultValue={formattedVisibleFrom}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={fields['visible-until'].id}>{m.board_documents_new_visible_until_label()}</Label>
                <Input
                  {...getInputProps(fields['visible-until'], {
                    type: 'datetime-local',
                  })}
                  defaultValue={formattedVisibleUntil}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id={fields.hightlighted.id}
                name={fields.hightlighted.name}
                type="checkbox"
                defaultChecked={settings.isHighlighted}
                className="size-4 rounded border border-input accent-primary"
              />
              <Label htmlFor={fields.hightlighted.id} className="cursor-pointer font-normal">
                {m.board_documents_new_highlight_label()}
              </Label>
            </div>
          </CardContent>
        </Card>

        {settings.dynamicType === DynamicType.Programme && templates.length > 0 && (
          <ProgrammeConfigFields templates={templates} storedConfig={settings.dynamicConfig} onChange={markDirty} />
        )}

        {appearance && <AppearanceFields dynamicType={appearance.type} appearance={appearance} onChange={markDirty} />}

        <FormActions>
          <SubmitButton>{m.board_documents_edit_submit()}</SubmitButton>
        </FormActions>
      </Form>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageDynamicBoardDocuments)

  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), {
    schema: updateDynamicDocumentSchema,
  })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { title, sectionId, appearance } = submission.value
  const visibleFrom = new Date(submission.value['visible-from'])
  const visibleUntil = new Date(submission.value['visible-until'])
  const isHighlighted = submission.value.hightlighted === 'on'
  const showServices = submission.value.showServices === 'on'

  // Parse dynamicConfig from form if provided
  let dynamicConfig: Prisma.InputJsonValue | undefined
  if (submission.value.dynamicConfig) {
    try {
      dynamicConfig = JSON.parse(submission.value.dynamicConfig)
    } catch {
      // Ignore invalid JSON, keep existing config
    }
  }

  const dynamicId = requireParamId(params.dynamicId, '/board')

  const parsedFrom = visibleFrom.getTime() > 0 ? visibleFrom : null
  const parsedUntil = visibleUntil.getTime() > 0 ? visibleUntil : null
  if (!validateVisibilityDates(parsedFrom, parsedUntil)) {
    session.flash('error', m.board_documents_date_range_error())
    return redirect(`/board/dynamic/${dynamicId}/edit`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  const { congregationId, id: actorId } = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    const settings = await updateDynamicDocument(db, dynamicId, congregationId, actorId, {
      title,
      sectionId,
      visibleFrom: parsedFrom,
      visibleUntil: parsedUntil,
      isHighlighted,
      showServices,
      dynamicConfig,
      appearance,
    })
    if (!settings) throw redirect('/board/documents')

    session.flash('success', m.board_dynamic_edit_success({ name: settings.title }))

    return redirect(`/board/dynamic/${dynamicId}/edit`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
