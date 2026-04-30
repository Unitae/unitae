import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import {
  DynamicType,
  type ProgrammeDynamicConfig,
  parseProgrammeConfig,
} from '~/features/display-board/model/dynamic-document.type'
import { updateDynamicDocumentSchema } from '~/features/display-board/schemas/board-document.schema'
import { updateDynamicDocument } from '~/features/display-board/server/board-document.server'
import { validateVisibilityDates } from '~/features/display-board/server/file-validation.server'
import { getTemplates } from '~/features/events/server/programme-templates.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, requireRole, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Checkbox } from '~/shared/ui/checkbox'
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

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requireRole(permissions, Role.BoardValidator)

  const dynamicId = requireParamId(params.dynamicId, '/board')

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const settings = await db.boardDynamicDocumentSettings.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
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

    return { settings, sections, templates }
  })
}

interface TemplateConfig {
  selected: boolean
  parts: boolean
  services: boolean
}

export default function EditDynamicDocumentPage({ loaderData, actionData }: Route.ComponentProps) {
  const { settings, sections, templates } = loaderData
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: updateDynamicDocumentSchema })
    },
  })

  const { blocker, markDirty } = useUnsavedChanges()

  // Parse existing config for programme documents
  const existingConfig = parseProgrammeConfig(settings.dynamicConfig)

  // Initialize template config state from existing config or defaults
  const [templateConfigs, setTemplateConfigs] = useState<Record<number, TemplateConfig>>(() => {
    if (existingConfig) {
      const configMap = new Map(existingConfig.templates.map(t => [t.templateId, t]))
      return Object.fromEntries(
        templates.map(t => {
          const existing = configMap.get(t.id)
          return [
            t.id,
            {
              selected: !!existing,
              parts: existing?.parts ?? true,
              services: existing?.services ?? true,
            },
          ]
        }),
      )
    }
    // Default: all templates selected with parts + services
    return Object.fromEntries(templates.map(t => [t.id, { selected: true, parts: true, services: true }]))
  })

  const [groupBy, setGroupBy] = useState<'date' | 'template'>(existingConfig?.groupBy ?? 'date')

  function updateTemplateConfig(templateId: number, patch: Partial<TemplateConfig>) {
    setTemplateConfigs(prev => ({
      ...prev,
      [templateId]: { ...prev[templateId], ...patch },
    }))
    markDirty()
  }

  // Build dynamicConfig JSON from state
  const selectedTemplates = Object.entries(templateConfigs)
    .filter(([_, c]) => c.selected && (c.parts || c.services))
    .map(([id, c]) => ({
      templateId: Number(id),
      parts: c.parts,
      services: c.services,
    }))

  const dynamicConfigJson: ProgrammeDynamicConfig = {
    templates: selectedTemplates,
    groupBy,
  }

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
              <select
                id={fields.sectionId.id}
                name={fields.sectionId.name}
                defaultValue={settings.sectionId}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {sections.map(section => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
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
          <Card>
            <CardContent className="flex flex-col gap-4">
              <h3 className="font-semibold text-sm">{m.board_dynamic_display_options_title()}</h3>

              {/* Per-template content selection */}
              <div className="flex flex-col gap-2">
                <Label>{m.programs_export_templates_label()}</Label>
                <div className="rounded-md border">
                  <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2 text-muted-foreground text-xs font-medium">
                    <div className="w-5" />
                    <div className="flex-1">{m.programs_export_meeting_type_label()}</div>
                    <div className="w-20 text-center">{m.programs_export_col_parts()}</div>
                    <div className="w-20 text-center">{m.programs_export_col_services()}</div>
                  </div>
                  {templates.map(template => {
                    const config = templateConfigs[template.id]
                    return (
                      <div key={template.id} className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
                        <Checkbox
                          checked={config.selected}
                          onCheckedChange={checked =>
                            updateTemplateConfig(template.id, {
                              selected: checked === true,
                            })
                          }
                        />
                        <div className="flex-1 text-sm">{template.name}</div>
                        <div className="flex w-20 justify-center">
                          <Checkbox
                            checked={config.parts}
                            disabled={!config.selected}
                            onCheckedChange={checked =>
                              updateTemplateConfig(template.id, {
                                parts: checked === true,
                              })
                            }
                          />
                        </div>
                        <div className="flex w-20 justify-center">
                          <Checkbox
                            checked={config.services}
                            disabled={!config.selected}
                            onCheckedChange={checked =>
                              updateTemplateConfig(template.id, {
                                services: checked === true,
                              })
                            }
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Grouping */}
              <div className="flex flex-col gap-2">
                <Label>{m.programs_export_group_by_label()}</Label>
                <Select
                  value={groupBy}
                  onValueChange={v => {
                    setGroupBy(v as 'date' | 'template')
                    markDirty()
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">{m.programs_export_group_by_date()}</SelectItem>
                    <SelectItem value="template">{m.programs_export_group_by_template()}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Hidden field to submit dynamicConfig as JSON */}
              <input type="hidden" name="dynamicConfig" value={JSON.stringify(dynamicConfigJson)} />
            </CardContent>
          </Card>
        )}

        <SubmitButton className="w-fit">{m.board_documents_edit_submit()}</SubmitButton>
      </Form>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requireRole(permissions, Role.BoardValidator)

  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), {
    schema: updateDynamicDocumentSchema,
  })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { title, sectionId } = submission.value
  const visibleFrom = new Date(submission.value['visible-from'])
  const visibleUntil = new Date(submission.value['visible-until'])
  const isHighlighted = submission.value.hightlighted === 'on'
  const showServices = submission.value.showServices === 'on'

  // Parse dynamicConfig from form if provided
  let dynamicConfig: Record<string, unknown> | undefined
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

  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const settings = await updateDynamicDocument(db, dynamicId, congregationId, {
      title,
      sectionId,
      visibleFrom: parsedFrom,
      visibleUntil: parsedUntil,
      isHighlighted,
      showServices,
      dynamicConfig,
    })

    session.flash('success', m.board_dynamic_edit_success({ name: settings.title }))

    return redirect(`/board/dynamic/${dynamicId}/edit`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
