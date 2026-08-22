import { Check, ChevronRight, Plus } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { listPartPresetsForSettings } from '~/features/events/index.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/preset-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_presets_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const congregation = context.get(congregationContext)

  if (!permissions.has(Permission.ProgramViewer) && !permissions.has(Permission.Admin)) throw redirect('/')

  return withScopeFromContext(context, async db => {
    // Congregations seeded before presets existed have none, and multi-tenant
    const presets = await listPartPresetsForSettings(db, currentUser.congregationId)
    return {
      presets: presets.map(preset => ({
        id: preset.id,
        name: preset.name,
        isSystem: preset.isSystem,
        hasReaderSlot: preset.hasReaderSlot,
        allowExternalSpeaker: preset.allowExternalSpeaker,
        usageCount: preset._count.templateParts + preset._count.eventParts,
      })),
    }
  })
}

export default function PresetListPage({ loaderData }: Route.ComponentProps) {
  const { presets } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.settings_presets_title()}
        subtitle={m.settings_presets_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_settings_assembly(), to: '/settings/congregation' },
          { label: m.settings_presets_breadcrumb() },
        ]}
        actions={
          <Button asChild>
            <Link to="./new">
              <Plus className="size-4" />
              {m.settings_presets_new_button()}
            </Link>
          </Button>
        }
      />

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.settings_presets_table_name()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.settings_presets_table_reader()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.settings_presets_table_external()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.settings_presets_table_usage()}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {presets.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {m.settings_presets_empty()}
                </TableCell>
              </TableRow>
            )}
            {presets.map(preset => (
              <TableRow key={preset.id}>
                <TableCell>
                  <Link to={`./${preset.id}/edit`} className="flex items-center gap-2 font-medium hover:underline">
                    {preset.name}
                    {preset.isSystem && <Badge variant="secondary">{m.settings_presets_system_badge()}</Badge>}
                  </Link>
                </TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {preset.hasReaderSlot && <Check className="inline size-4" />}
                </TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {preset.allowExternalSpeaker && <Check className="inline size-4" />}
                </TableCell>
                <TableCell className="text-center text-muted-foreground max-sm:hidden">{preset.usageCount}</TableCell>
                <TableCell>
                  <Link to={`./${preset.id}/edit`} aria-label={preset.name}>
                    <ChevronRight className="size-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
