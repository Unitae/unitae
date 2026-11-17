import { Plus } from 'lucide-react'
import { useState } from 'react'
import { redirect, useFetcher } from 'react-router'
import { isSystemTemplate, ResponsibilityScope } from '~/features/events'
import { getResponsibleTemplateIds, getTemplates } from '~/features/events/index.server'
import { setProgrammeShowsAttendance } from '~/features/settings/server/programme-attendance-setting.server'
import { NewTemplateDialog } from '~/features/settings/ui/NewTemplateDialog'
import { SettingsHeader } from '~/features/settings/ui/SettingsHeader'
import { BuiltInTemplates, type TemplateRow, TemplateTable } from '~/features/settings/ui/TemplateList'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { SettingRow } from '~/shared/ui/SettingRow'
import { Switch } from '~/shared/ui/switch'
import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => [{ title: m.settings_templates_meta_title() }]

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const isManager = permissions.has(Permission.CanManageProgramTemplates)

  return withScopeFromContext(context, async (db, congregationId) => {
    // A template's responsible sees the templates their roles run; the managers see them all.
    const own = isManager
      ? null
      : new Set(await getResponsibleTemplateIds(db, currentUser.id, congregationId, ResponsibilityScope.Service))
    if (own != null && own.size === 0) throw redirect('/settings')

    const rows: TemplateRow[] = (await getTemplates(db, congregationId))
      .filter(template => own == null || own.has(template.id))
      .map(template => ({
        id: template.id,
        key: template.key,
        name: template.name,
        color: template.color,
        weekDay: template.weekDay,
        startTime: template.startTime,
        endTime: template.endTime,
        parts: template._count.parts,
        services: template._count.serviceParts,
        responsibles: template.responsibles.map(responsible => responsible.role),
      }))
    return {
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

/** « Afficher l’assistance sur le programme », applied at once: the template managers decide it. */
export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanManageProgramTemplates)) throw redirect('/settings')
  const formData = await request.formData()
  if (formData.get('intent') !== 'programme-attendance') return { ok: false as const }
  const on = formData.get('on') === 'true'
  const { id: actorId } = context.get(currentAccountContext)
  await withScopeFromContext(context, (db, congregationId) =>
    setProgrammeShowsAttendance(db, congregationId, actorId, on),
  )
  return { ok: true as const }
}

export default function TemplateListPage({ loaderData }: Route.ComponentProps) {
  const { templates, builtIn, isManager, showsAttendance } = loaderData
  const [creating, setCreating] = useState(false)
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
          <TemplateTable rows={templates} />
        )}
        <BuiltInTemplates rows={builtIn} />
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
      {isManager && <NewTemplateDialog open={creating} onOpenChange={setCreating} />}
    </div>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
