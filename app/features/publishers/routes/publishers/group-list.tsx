import { Eye, Pencil, UsersRound } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { Button } from '~/shared/ui/button'

import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/group-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Proclamateurs - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canViewPublishers = await verifyRole(request, Role.PublisherViewer)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)

  if (!canViewPublishers) {
    logger.warn(
      `Try to load publisher groups. User ID: ${currentUser.id}. Does NOT have rights to access groups and publishers.`,
    )

    throw redirect('/')
  }

  logger.info(
    `Loading publisher groups. User ID: ${currentUser.id}. ${canManagePublisher ? 'Has' : 'Does NOT have'} rights to manage groups and publishers.`,
  )

  const groups = await db.publisherGroup.findMany({
    include: {
      responsible: true,
      deputy: true,
      _count: { select: { members: { where: { isPublisher: true } } } },
    },
    orderBy: [{ name: 'asc' }],
  })
  return {
    groups,
    canManagePublisher,
  }
}

export default function GroupListPage({ loaderData }: Route.ComponentProps) {
  const { groups = [], canManagePublisher } = loaderData

  if (groups.length < 1) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Groupes de prédication"
          subtitle="Liste de tous les groupes de prédication"
          actions={
            canManagePublisher && (
              <Button asChild>
                <Link to="./new">Nouveau groupe</Link>
              </Button>
            )
          }
        />
        <EmptyState
          icon={UsersRound}
          title="Il n'y a aucun groupe de prédication pour le moment !"
          description="Pour ajouter des groupes de prédication utilisez le bouton &laquo; Nouveau groupe &raquo; en haut à droite de cette page."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Groupes de prédication"
        subtitle="Liste de tous les groupes de prédication"
        actions={
          canManagePublisher && (
            <Button asChild>
              <Link to="./new">Nouveau groupe</Link>
            </Button>
          )
        }
      />

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead className="text-center max-sm:hidden">Responsable</TableHead>
              <TableHead className="text-center max-sm:hidden">Adjoint</TableHead>
              <TableHead className="text-center max-sm:hidden">Adresse</TableHead>
              <TableHead className="text-center">Proclamateurs</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map(group => (
              <TableRow key={group.name}>
                <TableCell>
                  <Link to={`./${group.id}/view`} className="font-medium hover:text-primary">
                    {group.name.toLocaleUpperCase()}
                  </Link>
                </TableCell>
                <TableCell className="text-center max-sm:hidden">
                  <Link to={`/congregation/publishers/${group.responsibleId}/view`} className="hover:text-primary">
                    {group.responsible.firstname} {group.responsible.lastname?.toLocaleUpperCase()}
                  </Link>
                </TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {group.deputy ? (
                    <Link to={`/congregation/publishers/${group.deputyId}/view`} className="hover:text-primary">
                      {group.deputy.firstname} {group.deputy.lastname?.toLocaleUpperCase()}
                    </Link>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-center max-sm:hidden">{group.adress}</TableCell>
                <TableCell className="text-center">{group._count.members}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {canManagePublisher && (
                      <Button asChild variant="ghost" size="icon">
                        <Link to={`./${group.id}/edit`}>
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                    )}
                    <Button asChild variant="ghost" size="icon">
                      <Link to={`./${group.id}/view`}>
                        <Eye className="size-4" />
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
