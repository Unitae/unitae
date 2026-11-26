import { parseWithZod } from '@conform-to/zod/v4'
import { Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { data, redirect, type ShouldRevalidateFunctionArgs, useFetcher } from 'react-router'
import { listScheduleTemplatesForSettings, updateScheduleTemplate } from '~/features/events/index.server'
import { onlyHelpPanelChanged } from '~/features/help'
import { scheduleTemplateView } from '~/features/settings/model/schedule-template-view'
import { scheduleTemplateSchema } from '~/features/settings/schemas/schedule-template.schema'
import { holdersOfRoles } from '~/features/settings/server/role-holders.queries'
import { handleCreateScheduleTemplate } from '~/features/settings/server/schedule-template-create-action.server'
import {
  handleScheduleTemplateItem,
  SCHEDULE_TEMPLATE_ITEM_INTENTS,
} from '~/features/settings/server/schedule-template-item-action.server'
import { getScheduleTemplateItems } from '~/features/settings/server/schedule-template-items.queries'
import { NewScheduleTemplateDialog } from '~/features/settings/ui/NewScheduleTemplateDialog'
import { openPanel, ScheduleTemplatePanel } from '~/features/settings/ui/ScheduleTemplatePanel'
import { ScheduleTemplateTable } from '~/features/settings/ui/ScheduleTemplateTable'
import { SettingsHeader } from '~/features/settings/ui/SettingsHeader'
import { useScheduleTemplatePage } from '~/features/settings/ui/use-schedule-template-page'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { listDelegatableRoles } from '~/shared/domain/roles.server'
import { Permission } from '~/shared/types/permission'
import { getRoleDisplayName } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { useMediaQuery } from '~/shared/ui/hooks/use-media-query'
import { DiscardChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { okWithToast } from './_toast.server'
import type { Route } from './+types/schedule-templates'

export const meta: Route.MetaFunction = () => [{ title: m.settings_schedule_templates_meta_title() }]

/** Réglages › « Modèles de planning » (6a-1b, 6a-1c): a schedule template's name, responsible and items. */
export function loader({ request, context }: Route.LoaderArgs) {
  if (!context.get(permissionsContext).has(Permission.CanManageProgramTemplates)) throw redirect('/settings')
  return withScopeFromContext(context, async (db, congregationId) => {
    const [templates, delegatable] = await Promise.all([
      listScheduleTemplatesForSettings(db, congregationId),
      listDelegatableRoles(db, congregationId),
    ])
    const roles = delegatable.map(role => ({ id: role.id, label: getRoleDisplayName(role) }))
    const roleIds = templates.flatMap(template => (template.responsibleRole ? [template.responsibleRole.id] : []))
    const holders = await holdersOfRoles(db, roleIds, congregationId)
    // The open template's items only (`?template=`): the list itself needs none.
    const open = Number(new URL(request.url).searchParams.get('template'))
    const items = templates.some(template => template.id === open)
      ? await getScheduleTemplateItems(db, open, congregationId)
      : null
    return { roles, templates: templates.map(template => scheduleTemplateView(template, roles, holders)), items }
  })
}

/** Entering or leaving an item changes only `?item=`: the template's data stays as it is. */
export function shouldRevalidate(args: ShouldRevalidateFunctionArgs) {
  if (onlyHelpPanelChanged(args)) return false
  const { currentUrl, nextUrl, formMethod, actionStatus, defaultShouldRevalidate } = args
  // A refusal may come from data changed elsewhere (an item deleted in another tab): read it again.
  if (formMethod != null && actionStatus != null && actionStatus >= 400) return true
  const sameTemplate = currentUrl.searchParams.get('template') === nextUrl.searchParams.get('template')
  if (formMethod == null && currentUrl.pathname === nextUrl.pathname && sameTemplate) return false
  return defaultShouldRevalidate
}

/** A refusal names the template it answers, so another template's panel never shows it. */
const refusal = (templateId: number | null, errors: string[], status = 400) =>
  data({ ok: false as const, templateId, errors }, { status })

export async function action({ request, context }: Route.ActionArgs) {
  if (!context.get(permissionsContext).has(Permission.CanManageProgramTemplates)) throw redirect('/settings')
  const currentUser = context.get(currentAccountContext)
  const formData = await request.formData()
  // « Nouveau modèle »: the dialog opens the template it created, from its id.
  if (formData.get('intent') === 'create-template') {
    return withScopeFromContext(context, async (db, congregationId) => {
      const result = await handleCreateScheduleTemplate(db, formData, { id: currentUser.id, congregationId })
      if (!result.ok) return data(result, { status: 400 })
      return okWithToast(request, m.settings_schedule_templates_created(), { id: result.id })
    })
  }
  if (SCHEDULE_TEMPLATE_ITEM_INTENTS.includes(String(formData.get('intent')))) {
    // An item's form posts to the address it is open at: `?template=` names its template.
    const scheduleTemplateId = Number(new URL(request.url).searchParams.get('template'))
    if (!Number.isInteger(scheduleTemplateId) || scheduleTemplateId <= 0) {
      return refusal(null, [m.settings_schedule_templates_error_vanished()], 409)
    }
    return withScopeFromContext(context, async (db, congregationId) => {
      const actor = { id: currentUser.id, congregationId }
      const result = await handleScheduleTemplateItem(db, scheduleTemplateId, formData, actor)
      if (result == null) return refusal(scheduleTemplateId, [m.settings_schedule_templates_error_vanished()], 409)
      if (result.kind === 'refused') return result.response
      // A reorder shows itself in the list, and the page announces it: no toast.
      if (result.kind === 'reordered') return data({ ok: true as const })
      return okWithToast(request, result.message)
    })
  }
  const submission = parseWithZod(formData, { schema: scheduleTemplateSchema })
  if (submission.status !== 'success') {
    const errors = Object.values(submission.reply().error ?? {}).flatMap(messages => messages ?? [])
    return refusal(Number(formData.get('scheduleTemplateId')) || null, errors)
  }
  const { scheduleTemplateId, name, responsibleRoleId } = submission.value

  return withScopeFromContext(context, async (db, congregationId) => {
    const change = { name, ...(responsibleRoleId !== undefined && { responsibleRoleId }) }
    const result = await updateScheduleTemplate(db, scheduleTemplateId, change, congregationId, currentUser.id)
    if (result == null) return refusal(scheduleTemplateId, [m.settings_schedule_templates_error_vanished()], 409)
    if (!result.ok) {
      const message =
        result.reason === 'name'
          ? m.settings_schedule_templates_error_name()
          : m.settings_schedule_templates_error_role()
      return refusal(scheduleTemplateId, [message])
    }
    return okWithToast(request, m.settings_schedule_templates_saved())
  })
}

export default function ScheduleTemplatesPage({ loaderData }: Route.ComponentProps) {
  const { templates, roles, items } = loaderData
  const fetcher = useFetcher<typeof action>()
  const docked = useMediaQuery('(min-width: 1280px)') === true
  const [dirty, setDirty] = useState(false)
  const [creating, setCreating] = useState(false)
  const newButton = useRef<HTMLButtonElement>(null)
  const page = useScheduleTemplatePage({
    templateIds: templates.map(template => template.id),
    // An item of the other sort (a part asked of a duties template) is not this template's.
    itemExists: (item, templateId) =>
      item.kind !== (templates.find(each => each.id === templateId)?.kind === 'duty' ? 'service' : 'part')
        ? false
        : item.id == null
          ? true
          : item.kind === 'part'
            ? (items?.parts.some(part => part.id === item.id) ?? false)
            : (items?.services.some(service => service.id === item.id) ?? false),
    dirty,
  })
  const template = templates.find(each => each.id === page.templateId)
  const item = template == null ? null : page.item
  // The name and responsible's refusal; an item's shows in the panel, from its own fetcher.
  const data =
    fetcher.state === 'idle' ? (fetcher.data as { ok?: boolean; templateId?: number; errors?: string[] }) : null
  const refused = data != null && data.ok === false ? data : undefined
  const errors = refused != null && refused.templateId === template?.id ? refused.errors : undefined

  return (
    <div className="flex flex-col">
      <SettingsHeader
        title={m.settings_entry_schedule_templates()}
        subtitle={m.settings_schedule_templates_subtitle()}
        actions={
          <Button size="sm" ref={newButton} onClick={() => setCreating(true)}>
            <Plus />
            {m.settings_schedule_templates_new()}
          </Button>
        }
      />
      <NewScheduleTemplateDialog
        open={creating}
        onOpenChange={setCreating}
        roles={roles}
        returnFocus={() => newButton.current}
      />
      {templates.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.settings_schedule_templates_empty()}</p>
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          {/* The `list` container: beside the docked panel the table drops to its docked columns. */}
          <div className="@container/list min-w-0 flex-[3_1_480px]">
            <ScheduleTemplateTable
              rows={templates}
              selectedId={template?.id ?? null}
              onSelect={row => page.open(row.id)}
            />
          </div>
          {docked && template && (
            <ScheduleTemplatePanel
              key={`${template.id}-${page.resetKey}`}
              template={template}
              roles={roles}
              items={items}
              item={item}
              docked
              errors={errors}
              fetcher={fetcher as never}
              onClose={() => page.open(null)}
              onOpenItem={page.openItem}
              onWalkItem={page.walkItem}
              onBack={page.back}
              onLeaveItem={page.leaveItem}
              onDirtyChange={setDirty}
            />
          )}
        </div>
      )}

      {!docked && template && (
        <ScheduleTemplatePanel
          key={`${template.id}-${page.resetKey}`}
          template={template}
          roles={roles}
          items={items}
          item={item}
          docked={false}
          errors={errors}
          fetcher={fetcher as never}
          onClose={() => page.open(null)}
          onOpenItem={page.openItem}
          onWalkItem={page.walkItem}
          onBack={page.back}
          onLeaveItem={page.leaveItem}
          onDirtyChange={setDirty}
        />
      )}

      <DiscardChangesDialog
        {...page.discard}
        description={m.common_discard_changes_description()}
        discardLabel={m.common_discard_changes_confirm()}
        returnFocus={openPanel}
      />
    </div>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
