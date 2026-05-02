import { ChevronRight, Plus } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { dayLabelShort } from '~/features/events/model/day-label'
import { getTemplates } from '~/features/events/server/programme-templates.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/template-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_templates_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)

  if (!permissions.has(Role.ProgramViewer) && !permissions.has(Role.Admin)) throw redirect('/')

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
            {templates.map(template => (
              <TableRow key={template.id}>
                <TableCell>
                  <Link to={`./${template.id}`} className="font-medium hover:underline">
                    {template.name}
                  </Link>
                </TableCell>
                <TableCell className="text-center max-sm:hidden">{template._count.parts}</TableCell>
                <TableCell className="text-center max-sm:hidden">{template._count.serviceRoles}</TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {template.weekDay != null ? (
                    <Badge variant="outline">{dayLabelShort(template.weekDay)}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">{m.settings_templates_one_time()}</span>
                  )}
                </TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {template.responsibles[0] ? (
                    <span className="text-sm">
                      {template.responsibles[0].user.firstname} {template.responsibles[0].user.lastname}
                    </span>
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
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
