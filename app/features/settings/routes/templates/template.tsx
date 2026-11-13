import { Status } from '@unitae/ui'
import { Copy, MoreHorizontal, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { redirect, useFetcher } from 'react-router'
import { isSystemTemplate } from '~/features/events'
import { isTemplateResponsible } from '~/features/events/index.server'
import { getTemplatePage } from '~/features/settings/server/template-page.queries'
import { ConfirmDialog } from '~/features/settings/ui/ConfirmDialog'
import { SettingsHeader } from '~/features/settings/ui/SettingsHeader'
import { TemplateEditor } from '~/features/settings/ui/TemplateEditor'
import { TemplateInfoPanel } from '~/features/settings/ui/TemplateInfoPanel'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
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

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const templateId = requireParamId(params.templateId, '/settings/templates')
  const isManager = permissions.has(Permission.CanManageProgramTemplates)

  return withScopeFromContext(context, async (db, congregationId) => {
    const page = await getTemplatePage(db, templateId, congregationId, { withResponsibles: isManager })
    if (!page) throw redirect('/settings/templates')
    const responsible = (await isTemplateResponsible(db, templateId, currentUser.id, congregationId)) != null
    // A template's responsible and the managers change it; whoever reads the programmes may look at it.
    if (!isManager && !responsible && !permissions.has(Permission.CanViewPrograms))
      throw redirect('/settings/templates')
    return { page, isManager, editable: isManager || responsible, builtIn: isSystemTemplate(page.template.key) }
  })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const templateId = requireParamId(params.templateId, '/settings/templates')
  const isManager = permissions.has(Permission.CanManageProgramTemplates)
  const formData = await request.formData()

  const result = await withScopeFromContext(context, async (db, congregationId) => {
    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, congregationId)
    if (!isManager && !responsible) throw redirect('/settings/templates')
    return handleTemplateAction(db, templateId, formData, { id: currentUser.id, congregationId, isManager })
  })

  if (result == null) throw redirect(`/settings/templates/${templateId}`)
  if (result.kind === 'refused') return result.response
  if (result.kind === 'moved') return redirectWithToast(request, result.to, result.message)
  return okWithToast(request, result.message)
}

export default function TemplatePage({ loaderData }: Route.ComponentProps) {
  const { page, isManager, editable, builtIn } = loaderData
  const { template } = page
  const infoFetcher = useFetcher()
  const menuFetcher = useFetcher()
  const [deleting, setDeleting] = useState(false)
  const [infoDirty, setInfoDirty] = useState(false)
  const [editorDirty, setEditorDirty] = useState(false)
  const { blocker, setDirty } = useUnsavedChanges()
  useEffect(() => setDirty(infoDirty || editorDirty), [infoDirty, editorDirty, setDirty])
  const onEditorDirty = useCallback((dirty: boolean) => setEditorDirty(dirty), [])

  const subtitle = builtIn
    ? m.settings_template_built_in_subtitle()
    : page.eventCount > 0
      ? m.settings_template_page_used({ count: page.eventCount })
      : m.settings_template_page_subtitle()

  return (
    // The marker lets the app shell stop clipping as a scroll container, so the docked editor can stick.
    <div data-sticky-content="" className={cn('flex flex-col', infoDirty && 'pb-20')}>
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
        <TemplateInfoPanel
          template={template}
          builtIn={builtIn}
          editable={editable}
          fetcher={infoFetcher}
          onDirtyChange={setInfoDirty}
          responsibles={page.responsibles ?? undefined}
        />
        {builtIn ? (
          <p className="text-muted-foreground text-sm">
            {template.key === 'day-off'
              ? m.settings_template_system_body_day_off()
              : m.settings_template_system_body_freeform()}
          </p>
        ) : (
          <TemplateEditor
            templateId={template.id}
            parts={template.parts}
            services={template.serviceParts}
            roles={page.roles}
            presets={page.presets}
            sectionSuggestions={page.sectionSuggestions}
            trackSuggestions={page.trackSuggestions}
            editable={editable}
            infoDirty={infoDirty}
            onDirtyChange={onEditorDirty}
          />
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
