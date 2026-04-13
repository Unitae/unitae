import { ChevronRight, Plus } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { dayLabelShort } from '~/features/events/model/day-label'
import { getTemplates } from '~/features/events/server/programme-templates.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/template-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Modèles de programme - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [
    Role.Admin,
    Role.ProgramViewer,
    Role.ProgramManager,
  ])

  if (!can(Role.ProgramViewer) && !can(Role.Admin)) throw redirect('/')

  return withScope(congregationId, async db => {
    const templates = await getTemplates(db, congregationId)
    return { templates }
  })
}

export default function TemplateListPage({ loaderData }: Route.ComponentProps) {
  const { templates } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Assemblée / Modèles de programme"
        subtitle="Gérez les modèles de réunions utilisés pour générer les programmes."
        actions={
          <Button asChild>
            <Link to="./new">
              <Plus className="size-4" />
              Nouveau modèle
            </Link>
          </Button>
        }
      />

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead className="text-center max-sm:hidden">Parties</TableHead>
              <TableHead className="text-center max-sm:hidden">Services</TableHead>
              <TableHead className="text-center max-sm:hidden">Jour</TableHead>
              <TableHead className="text-center max-sm:hidden">Responsable</TableHead>
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
                    <span className="text-muted-foreground text-sm">Ponctuel</span>
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
