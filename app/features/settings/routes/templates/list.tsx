import { Plus } from 'lucide-react'
import { useState } from 'react'
import { redirect, useFetcher, useSearchParams } from 'react-router'
import { isSystemTemplate, type ProgrammeTemplateCounts, programmeTemplate } from '~/features/events'
import { getTemplates } from '~/features/events/index.server'
import { setProgrammeShowsAttendance } from '~/features/settings/server/programme-attendance-setting.server'
import { getTypePanel } from '~/features/settings/server/type-panel.queries'
import { NewTemplateDialog } from '~/features/settings/ui/NewTemplateDialog'
import { SettingsHeader } from '~/features/settings/ui/SettingsHeader'
import { BuiltInTemplates, type TemplateRow, TemplateTable } from '~/features/settings/ui/TemplateList'
import { TypePanel } from '~/features/settings/ui/TypePanel'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { useMediaQuery } from '~/shared/ui/hooks/use-media-query'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { SettingRow } from '~/shared/ui/SettingRow'
import { Switch } from '~/shared/ui/switch'
import { DiscardChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { okWithToast, redirectWithToast } from '../_toast.server'
import { handleTemplateAction } from './_template-action.server'
import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => [{ title: m.settings_templates_meta_title() }]

/** A kind's parts and services: those of the schedule templates it uses. */
function countsOf(template: ProgrammeTemplateCounts) {
  const counted = programmeTemplate(template)
  return { parts: counted?.parts ?? 0, services: counted?.services ?? 0 }
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const isManager = permissions.has(Permission.CanManageProgramTemplates)

  return withScopeFromContext(context, async (db, congregationId) => {
    // The templates' managers' alone since 6a-1c: a template's responsible fills its schedules on the meetings.
    if (!isManager) throw redirect('/settings')

    const rows: TemplateRow[] = (await getTemplates(db, congregationId)).map(template => ({
      id: template.id,
      key: template.key,
      name: template.name,
      color: template.color,
      weekDay: template.weekDay,
      startTime: template.startTime,
      endTime: template.endTime,
      // What its schedule templates hold (6b-0).
      ...countsOf(template),
      responsibles: template.responsibles,
    }))
    // The type open in the side panel (`?type=`, 6b-2b): its fields and the schedule templates it uses.
    const open = Number(new URL(request.url).searchParams.get('type'))
    const type =
      Number.isInteger(open) && rows.some(row => row.id === open)
        ? await getTypePanel(db, open, { congregationId, timeZone: context.get(congregationContext).timezone })
        : null
    return {
      type,
      templates: rows.filter(row => !isSystemTemplate(row.key)),
      builtIn: isManager ? rows.filter(row => isSystemTemplate(row.key)) : [],
      isManager,
      // The congregation's choice, the template managers'.
      showsAttendance: isManager
        ? await getBoolSetting(db, CongregationSettingKey.ProgrammeShowsAttendance, congregationId)
        : null,
    }
  })
}

/**
 * « Afficher l’assistance sur le programme », applied at once, and the intents of the type open in the side panel,
 * named by `typeId` (6b-2b): the template managers decide both.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanManageProgramTemplates)) throw redirect('/settings')
  const formData = await request.formData()
  if (formData.has('typeId')) return typeAction(request, context, formData)
  if (formData.get('intent') !== 'programme-attendance') return { ok: false as const }
  const on = formData.get('on') === 'true'
  const { id: actorId } = context.get(currentAccountContext)
  await withScopeFromContext(context, (db, congregationId) =>
    setProgrammeShowsAttendance(db, congregationId, actorId, on),
  )
  return { ok: true as const }
}

async function typeAction(request: Request, context: Route.ActionArgs['context'], formData: FormData) {
  const typeId = Number(formData.get('typeId'))
  if (!Number.isInteger(typeId) || typeId <= 0) throw redirect('/settings/templates')
  const { id } = context.get(currentAccountContext)
  const { timezone: timeZone } = context.get(congregationContext)
  const result = await withScopeFromContext(context, (db, congregationId) =>
    handleTemplateAction(db, typeId, formData, { id, congregationId, isManager: true, timeZone }),
  )
  if (result == null) throw redirect('/settings/templates')
  if (result.kind === 'refused') return result.response
  if (result.kind === 'moved') return redirectWithToast(request, result.to, result.message)
  return okWithToast(request, result.message)
}

export default function TemplateListPage({ loaderData }: Route.ComponentProps) {
  const { type, templates, builtIn, isManager, showsAttendance } = loaderData
  const [creating, setCreating] = useState(false)
  // The open type, docked beside the list from 1280 px, a sheet below; leaving it with changes not saved asks first.
  const docked = useMediaQuery('(min-width: 1280px)') === true
  const [, setParams] = useSearchParams()
  const { blocker, setDirty } = useUnsavedChanges('type')
  const close = () =>
    setParams(params => {
      params.delete('type')
      return params
    })
  const panel = type && <TypePanel type={type} docked={docked} onClose={close} onDirtyChange={setDirty} />
  const attendanceFetcher = useFetcher()
  // Shown as asked while the change is on its way.
  const pendingOn = attendanceFetcher.formData?.get('on')
  const attendanceOn = pendingOn != null ? pendingOn === 'true' : showsAttendance === true

  return (
    <div className="flex flex-col">
      <SettingsHeader
        title={m.settings_entry_templates()}
        subtitle={m.settings_templates_subtitle()}
        actions={
          isManager && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" />
              {m.settings_templates_new_button()}
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-6">
        {templates.length === 0 ? (
          <p className="rounded-lg border bg-card px-4.5 py-6 text-center text-muted-foreground text-sm">
            {m.settings_templates_empty()}
          </p>
        ) : (
          <div className="flex flex-wrap items-start gap-6">
            {/* Beside the docked panel the table keeps its name and when columns. */}
            <div className="min-w-0 flex-[3_1_480px]">
              <TemplateTable rows={templates} selectedId={type?.id ?? null} compact={docked && type != null} />
            </div>
            {docked && panel}
          </div>
        )}
        <BuiltInTemplates rows={builtIn} selectedId={type?.id ?? null} compact={docked && type != null} />
        {showsAttendance != null && (
          <div className="overflow-hidden rounded-lg border bg-card">
            <SettingRow
              title={m.settings_programme_attendance()}
              description={m.settings_programme_attendance_description()}
              htmlFor="programme-attendance"
            >
              <Switch
                id="programme-attendance"
                checked={attendanceOn}
                onCheckedChange={on =>
                  attendanceFetcher.submit({ intent: 'programme-attendance', on: String(on) }, { method: 'post' })
                }
              />
            </SettingRow>
          </div>
        )}
      </div>
      {!docked && panel}
      {/* Another type, the panel closed or another page: the changes go, the page may stay. */}
      <DiscardChangesDialog
        open={blocker.state === 'blocked'}
        onStay={() => blocker.reset?.()}
        onDiscard={() => blocker.proceed?.()}
        description={m.common_discard_changes_description()}
        discardLabel={m.common_discard_changes_confirm()}
      />
      {isManager && <NewTemplateDialog open={creating} onOpenChange={setCreating} />}
    </div>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
