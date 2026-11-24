import { parseWithZod } from '@conform-to/zod/v4'
import { SidePanel } from '@unitae/ui'
import { data, redirect, useFetcher } from 'react-router'
import { listScheduleTemplatesForSettings, updateScheduleTemplate } from '~/features/events/index.server'
import { scheduleTemplateSchema } from '~/features/settings/schemas/schedule-template.schema'
import { ScheduleTemplateForm } from '~/features/settings/ui/ScheduleTemplateForm'
import { type ScheduleTemplateRow, ScheduleTemplateTable } from '~/features/settings/ui/ScheduleTemplateTable'
import { SettingsHeader } from '~/features/settings/ui/SettingsHeader'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { listDelegatableRoles } from '~/shared/domain/roles.server'
import { Permission } from '~/shared/types/permission'
import { getRoleDisplayName } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { useSideEditor } from '~/shared/ui/hooks/use-side-editor'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'
import { DiscardChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { okWithToast } from './_toast.server'
import type { Route } from './+types/schedule-templates'

export const meta: Route.MetaFunction = () => [{ title: m.settings_schedule_templates_meta_title() }]

const FORM_ID = 'schedule-template-form'

// A template left unnamed reads as its kind's label, as on the meeting's page.
const kindLabel = (kind: string) =>
  kind === 'programme' ? m.programs_view_spiritual_program() : m.programs_view_services()
const kindTag = (kind: string) =>
  kind === 'programme' ? m.programs_schedule_kind_programme() : m.programs_schedule_kind_duty()
const content = (kind: string, items: number) =>
  kind === 'programme' ? m.programs_new_parts({ count: items }) : m.programs_new_services({ count: items })

/** Réglages › « Modèles de planning » (6a-1b, plan §11): a schedule template's name and responsible. */
export function loader({ context }: Route.LoaderArgs) {
  if (!context.get(permissionsContext).has(Permission.CanManageProgramTemplates)) throw redirect('/settings')
  return withScopeFromContext(context, async (db, congregationId) => {
    const [templates, roles] = await Promise.all([
      listScheduleTemplatesForSettings(db, congregationId),
      listDelegatableRoles(db, congregationId),
    ])
    const roleLabel = new Map(roles.map(role => [role.id, getRoleDisplayName(role)]))
    return {
      roles: roles.map(role => ({ id: role.id, label: getRoleDisplayName(role) })),
      templates: templates.map(template => ({
        id: template.id,
        title: template.name ?? kindLabel(template.kind),
        // An unnamed template reads as its kind: the kinds suggesting it tell two of them apart.
        detail: [
          kindTag(template.kind),
          content(template.kind, template.items),
          ...(template.name == null ? template.kinds.map(kind => kind.name) : []),
        ].join(' · '),
        responsible:
          template.responsibleRole == null
            ? null
            : (roleLabel.get(template.responsibleRole.id) ?? getRoleDisplayName(template.responsibleRole)),
        responsibleRoleId: template.responsibleRole?.id ?? null,
        name: template.name ?? '',
        placeholder: template.key == null ? '' : kindLabel(template.kind),
        kinds: template.kinds.map(kind => kind.name),
        schedules: template.schedules,
      })),
    }
  })
}

const refusal = (message: string, status = 400) => data({ ok: false as const, errors: [message] }, { status })

export async function action({ request, context }: Route.ActionArgs) {
  if (!context.get(permissionsContext).has(Permission.CanManageProgramTemplates)) throw redirect('/settings')
  const currentUser = context.get(currentAccountContext)
  const submission = parseWithZod(await request.formData(), { schema: scheduleTemplateSchema })
  if (submission.status !== 'success') return refusal(m.settings_schedule_templates_error_vanished())
  const { scheduleTemplateId, name, responsibleRoleId } = submission.value

  return withScopeFromContext(context, async (db, congregationId) => {
    const result = await updateScheduleTemplate(
      db,
      scheduleTemplateId,
      { name, responsibleRoleId },
      congregationId,
      currentUser.id,
    )
    if (result == null) return refusal(m.settings_schedule_templates_error_vanished(), 409)
    if (!result.ok) {
      return refusal(
        result.reason === 'name'
          ? m.settings_schedule_templates_error_name()
          : m.settings_schedule_templates_error_role(),
      )
    }
    return okWithToast(request, m.settings_schedule_templates_saved())
  })
}

export default function ScheduleTemplatesPage({ loaderData }: Route.ComponentProps) {
  const { templates, roles } = loaderData
  const fetcher = useFetcher<typeof action>()
  const panel = useSideEditor<'template'>(target => templates.some(template => template.id === target.id))
  const template = panel.target?.id != null ? templates.find(each => each.id === panel.target?.id) : undefined
  useCloseOnSave(fetcher, panel.close)
  const errors = fetcher.state === 'idle' && fetcher.data && !fetcher.data.ok ? fetcher.data.errors : undefined

  const rows: ScheduleTemplateRow[] = templates.map(({ id, title, detail, responsible, kinds }) => ({
    id,
    title,
    detail,
    responsible,
    kinds: kinds.length,
  }))
  const description =
    template == null
      ? undefined
      : template.schedules === 0
        ? m.settings_schedule_templates_used_none()
        : m.settings_schedule_templates_used({ count: template.schedules })
  const form = template && (
    <ScheduleTemplateForm
      key={template.id}
      template={template}
      roles={roles}
      errors={errors}
      fetcher={fetcher as never}
      id={FORM_ID}
      formRef={panel.formRef}
    />
  )
  const footer = (
    <>
      <Button type="button" variant="ghost" onClick={panel.close}>
        {m.common_cancel()}
      </Button>
      <SubmitButton form={FORM_ID} disabled={fetcher.state !== 'idle'}>
        {m.common_save()}
      </SubmitButton>
    </>
  )

  return (
    <div className="flex flex-col">
      <SettingsHeader
        title={m.settings_entry_schedule_templates()}
        subtitle={m.settings_schedule_templates_subtitle()}
      />
      {templates.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.settings_schedule_templates_empty()}</p>
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          {/* The `list` container: beside the docked panel the table drops to its docked columns. */}
          <div className="@container/list min-w-0 flex-[3_1_480px]">
            <ScheduleTemplateTable
              rows={rows}
              selectedId={template?.id ?? null}
              onSelect={(row, trigger) => panel.request({ kind: 'template', id: row.id, trigger })}
            />
          </div>
          {panel.docked && template && (
            <SidePanel
              key={template.id}
              title={template.title}
              description={description}
              closeLabel={m.common_close()}
              onClose={() => panel.request(null)}
              returnFocus={panel.target?.trigger}
              footer={footer}
            >
              {form}
            </SidePanel>
          )}
        </div>
      )}

      {!panel.docked && (
        <Sheet open={template != null} onOpenChange={next => !next && panel.close()}>
          <SheetContent className="sm:max-w-md">
            <SheetHeader>
              <SheetTitle>{template?.title}</SheetTitle>
              {description && <SheetDescription>{description}</SheetDescription>}
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-4 pb-4">{form}</div>
            <SheetFooter className="flex-row justify-end border-border border-t">{footer}</SheetFooter>
          </SheetContent>
        </Sheet>
      )}

      <DiscardChangesDialog
        {...panel.discard}
        description={m.common_discard_changes_description()}
        discardLabel={m.common_discard_changes_confirm()}
      />
    </div>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
