import { Callout, Status } from '@unitae/ui'
import { Copy, MoreHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { redirect, useFetcher } from 'react-router'
import { isSystemTemplate } from '~/features/events'
import { countMeetingsToMove } from '~/features/events/index.server'
import { scheduleTemplateView } from '~/features/settings/model/schedule-template-view'
import { getTemplatePage } from '~/features/settings/server/template-page.queries'
import { ConfirmDialog } from '~/features/settings/ui/ConfirmDialog'
import { SettingsHeader } from '~/features/settings/ui/SettingsHeader'
import { TemplateInfoPanel } from '~/features/settings/ui/TemplateInfoPanel'
import { TemplateSchedules } from '~/features/settings/ui/TemplateSchedules'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'
import { cn } from '~/shared/utils/utils'
import { okWithToast, redirectWithToast } from '../_toast.server'
import { handleTemplateAction } from './_template-action.server'
import type { Route } from './+types/template'

export const meta: Route.MetaFunction = ({ loaderData }) => [
  {
    title: loaderData
      ? `${loaderData.page.template.name} - ${m.settings_templates_meta_title()}`
      : m.settings_templates_meta_title(),
  },
]

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const templateId = requireParamId(params.templateId, '/settings/templates')
  const isManager = permissions.has(Permission.CanManageProgramTemplates)
  // The templates' managers' alone since 6a-1c: a template's responsible fills its schedules on the meetings.
  if (!isManager) throw redirect('/settings/templates')

  return withScopeFromContext(context, async (db, congregationId) => {
    const page = await getTemplatePage(db, templateId, congregationId)
    if (!page) throw redirect('/settings/templates')
    const editable = isManager
    const builtIn = isSystemTemplate(page.template.key)
    // Empty meetings ahead still on the template's old day or hours, for whoever may bring them along.
    const meetingsToMove =
      editable && !builtIn
        ? await countMeetingsToMove(db, templateId, {
            congregationId,
            timeZone: context.get(congregationContext).timezone,
            now: new Date(),
          })
        : 0
    // Each as « Modèles de planning » writes it; who holds a responsible role is that page's to say.
    const schedules = page.scheduleTemplates.map(each => {
      const { id, title, detail, responsible } = scheduleTemplateView(each, page.roles, new Map())
      return { id, title, detail, responsible }
    })
    // What the page reads of the type, and no more: its parts and services are « Modèles de planning »'s.
    const { name, key, color, weekDay, startTime, endTime, attendanceKind } = page.template
    const template = { name, key, color, weekDay, startTime, endTime, attendanceKind }
    return {
      page: { template, eventCount: page.eventCount },
      schedules,
      isManager,
      editable,
      builtIn,
      meetingsToMove,
    }
  })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const templateId = requireParamId(params.templateId, '/settings/templates')
  const isManager = permissions.has(Permission.CanManageProgramTemplates)
  const formData = await request.formData()

  if (!isManager) throw redirect('/settings/templates')
  const result = await withScopeFromContext(context, (db, congregationId) => {
    const { timezone: timeZone } = context.get(congregationContext)
    return handleTemplateAction(db, templateId, formData, { id: currentUser.id, congregationId, isManager, timeZone })
  })

  if (result == null) throw redirect(`/settings/templates/${templateId}`)
  if (result.kind === 'refused') return result.response
  if (result.kind === 'moved') return redirectWithToast(request, result.to, result.message)
  return okWithToast(request, result.message)
}

export default function TemplatePage({ loaderData }: Route.ComponentProps) {
  const { page, schedules, isManager, editable, builtIn, meetingsToMove } = loaderData
  const moveFetcher = useFetcher()
  const { template } = page
  const infoFetcher = useFetcher()
  const menuFetcher = useFetcher()
  const [deleting, setDeleting] = useState(false)
  const [infoDirty, setInfoDirty] = useState(false)
  const { blocker, setDirty } = useUnsavedChanges()
  useEffect(() => setDirty(infoDirty), [infoDirty, setDirty])

  const subtitle = builtIn
    ? m.settings_template_built_in_subtitle()
    : page.eventCount > 0
      ? m.settings_template_page_used({ count: page.eventCount })
      : m.settings_template_page_subtitle()

  return (
    <div className={cn('flex flex-col', infoDirty && 'pb-20')}>
      <UnsavedChangesDialog blocker={blocker} />
      <SettingsHeader
        title={template.name}
        subtitle={subtitle}
        trail={[{ label: m.settings_entry_templates(), to: '/settings/templates' }]}
        titleBadge={!editable && <Status tone="neutral">{m.settings_template_read_only()}</Status>}
        actions={
          isManager &&
          !builtIn && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={m.common_more_actions()}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-w-72">
                <DropdownMenuItem onSelect={() => menuFetcher.submit({ intent: 'duplicate' }, { method: 'post' })}>
                  <Copy />
                  {m.settings_template_duplicate()}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={page.eventCount > 0}
                  onSelect={() => setDeleting(true)}
                >
                  <Trash2 />
                  {m.settings_template_delete()}
                </DropdownMenuItem>
                {page.eventCount > 0 && (
                  <DropdownMenuLabel className="font-normal text-faint text-xs">
                    {m.settings_template_delete_in_use({ count: page.eventCount })}
                  </DropdownMenuLabel>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />

      <div className="flex flex-col gap-6">
        {/* Hidden while the day or hours are being edited: the count is for what is saved. */}
        {meetingsToMove > 0 && !infoDirty && (
          <Callout
            tone="info"
            title={m.settings_template_move_meetings_title({ count: meetingsToMove })}
            action={
              <Button
                size="sm"
                variant="outline"
                disabled={moveFetcher.state !== 'idle'}
                onClick={() => moveFetcher.submit({ intent: 'move-meetings' }, { method: 'post' })}
              >
                {m.settings_template_move_meetings_button({ count: meetingsToMove })}
              </Button>
            }
          >
            {m.settings_template_move_meetings_body()}
          </Callout>
        )}
        <TemplateInfoPanel
          template={template}
          builtIn={builtIn}
          editable={editable}
          fetcher={infoFetcher}
          onDirtyChange={setInfoDirty}
          manager={isManager}
        />
        {builtIn ? (
          <p className="text-muted-foreground text-sm">{m.settings_template_system_body_freeform()}</p>
        ) : (
          <TemplateSchedules rows={schedules} />
        )}
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={m.settings_template_delete_title()}
        description={m.settings_template_delete_description({ name: template.name })}
        confirmLabel={m.common_delete()}
        destructive
        onConfirm={() => menuFetcher.submit({ intent: 'delete' }, { method: 'post' })}
      />
    </div>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
