import { ChevronRight, Plus } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { dayLabelShort, isSystemTemplate, ResponsibleScope } from '~/features/events'
import { getTemplates } from '~/features/events/index.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { formatPersonName, resolveAccountName } from '~/shared/utils/format-person-name'

import type { Route } from './+types/template-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_templates_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.ProgramViewer) && !permissions.has(Permission.Admin)) throw redirect('/')

  return withScopeFromContext(context, async db => {
    const templates = await getTemplates(db, currentUser.congregationId)
    return { templates }
  })
}

export default function TemplateListPage({ loaderData }: Route.ComponentProps) {
  const { templates } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.settings_templates_title()}
        subtitle={m.settings_templates_subtitle()}
        breadcrumbs={[{ label: m.sidebar_settings_assembly(), to: '/settings/congregation' }, { label: 'Modèles' }]}
        actions={
          <Button asChild>
            <Link to="./new">
              <Plus className="size-4" />
              {m.settings_templates_new_button()}
            </Link>
          </Button>
        }
      />

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.settings_templates_table_name()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.settings_templates_table_parts()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.settings_templates_table_services()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.settings_templates_table_day()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.settings_templates_table_responsible()}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map(template => {
              const fullResponsible = template.responsibles.find(r => r.scope === ResponsibleScope.Full)
              const serviceResponsible = template.responsibles.find(r => r.scope === ResponsibleScope.Service)
              return (
                <TableRow key={template.id}>
                  <TableCell>
                    <Link to={`./${template.id}`} className="font-medium hover:underline">
                      {template.name}
                    </Link>
                    {isSystemTemplate(template.key) && (
                      <Badge variant="secondary" className="ml-2 align-middle text-xs">
                        {m.settings_templates_system_badge()}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center max-sm:hidden">{template._count.parts}</TableCell>
                  <TableCell className="text-center max-sm:hidden">{template._count.serviceParts}</TableCell>
                  <TableCell className="text-center max-sm:hidden">
                    {template.weekDay != null ? (
                      <Badge variant="outline">{dayLabelShort(template.weekDay)}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">{m.settings_templates_one_time()}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center max-sm:hidden">
                    {fullResponsible || serviceResponsible ? (
                      <div className="flex flex-col">
                        {fullResponsible && (
                          <span className="text-sm">{formatPersonName(resolveAccountName(fullResponsible.user))}</span>
                        )}
                        {serviceResponsible && (
                          <span className="text-muted-foreground text-xs">
                            {m.settings_template_view_service_responsible_short()}
                            {': '}
                            {formatPersonName(resolveAccountName(serviceResponsible.user))}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link to={`./${template.id}`}>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </Link>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
