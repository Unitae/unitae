import { redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { getAllEventType } from '~/features/events/server/event-kind.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { Badge } from '~/shared/ui/badge'

import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import type { Route } from './+types/event-kind-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Types d'évènement - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.Admin])
  const canManageSettings = can(Role.Admin)

  if (!canManageSettings) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const kinds = await getAllEventType(db)

    return {
      kinds,
    }
  })
}

export default function EventKindSettingsPage({ loaderData }: Route.ComponentProps) {
  const { kinds } = loaderData
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Assemblée / Types d'évènement"
        subtitle="Cette page permet de créer ou de modifier les types d'évènement utilisés dans le module des programmes de l'assemblée"
      />

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead className="text-center max-sm:hidden">Couleur</TableHead>
              <TableHead className="text-center max-sm:hidden">Jour</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kinds.map(kind => (
              <TableRow key={kind.name}>
                <TableCell className="font-medium">{kind.name}</TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {kind.color != null ? (
                    <span className="inline-block size-5 rounded-full" style={{ backgroundColor: kind.color }} />
                  ) : (
                    <span className="inline-block size-5 rounded-full bg-muted" />
                  )}
                </TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {kind.weekDay != null ? (
                    <Badge variant="outline">{kind.weekDay}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">Aucune récurrence</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
