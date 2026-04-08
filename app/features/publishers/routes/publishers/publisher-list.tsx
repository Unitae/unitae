import { BarChart3, Eye, Mail, Pencil, Users } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getPublishersWithGroup } from '~/features/publishers/server/publishers'
import logger from '~/shared/libs/logger.server'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/publisher-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Proclamateurs - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canViewPublishers = await verifyRole(request, Role.PublisherViewer)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)
  const canViewActivities = await verifyRole(request, Role.ActivityViewer)

  if (!canViewPublishers) {
    logger.warn(
      `Try to load publishers. User ID: ${currentUser.id}. Does NOT have rights to access groups and publishers.`,
    )

    throw redirect('/')
  }

  logger.info(
    `Loading publishers. User ID: ${currentUser.id}. ${canManagePublisher ? 'Has' : 'Does NOT have'} rights to manage groups and publishers.`,
  )

  const users = await getPublishersWithGroup()

  return {
    users: users.map(user => ({
      email: user.email,
      id: user.id,
      active: user.active,
      firstname: user.firstname,
      lastname: user.lastname,
      isPublisher: user.isPublisher,
      publisherGroup: user.publisherGroup,
    })),
    canManagePublisher,
    canViewActivities,
  }
}

export default function PublisherListPage({ loaderData }: Route.ComponentProps) {
  const { users, canManagePublisher, canViewActivities } = loaderData

  if (users.length < 1) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Proclamateurs"
          subtitle="Liste de tous les fiches de proclamateurs de l'assemblée"
          actions={
            canManagePublisher && (
              <Button asChild>
                <Link to="./new">Créer proclamateur</Link>
              </Button>
            )
          }
        />

        <EmptyState
          icon={Users}
          title="Il n'y a aucun proclamateur pour le moment !"
          description="Pour ajouter des proclamateurs utilisez le bouton &laquo; Créer proclamateur &raquo; en haut à droite de cette page ou créez des fiches de proclamateur à partir des utilisateurs."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Proclamateurs"
        subtitle="Liste de tous les fiches de proclamateurs de l'assemblée"
        actions={
          <>
            {canViewActivities && (
              <Button asChild variant="outline" size="icon" title="Consulter l'activité des proclamateurs">
                <Link to="./activity">
                  <BarChart3 className="size-4" />
                </Link>
              </Button>
            )}
            {canManagePublisher && (
              <Button asChild>
                <Link to="./new">Créer proclamateur</Link>
              </Button>
            )}
          </>
        }
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-center max-sm:text-left">Prénom</TableHead>
            <TableHead className="text-center">Nom</TableHead>
            <TableHead className="text-center">Groupe</TableHead>
            <TableHead className="text-center max-sm:hidden">Contact</TableHead>
            {canManagePublisher && <TableHead className="text-center" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map(user => (
            <TableRow key={user.email}>
              <TableCell className="text-center max-sm:text-left">
                <Link to={`/congregation/publishers/${user.id}/view`} className="hover:text-primary">
                  {user.firstname}
                </Link>
              </TableCell>
              <TableCell className="text-center">
                <Link to={`/congregation/publishers/${user.id}/view`} className="hover:text-primary">
                  {user.lastname?.toLocaleUpperCase()}
                </Link>
              </TableCell>
              <TableCell className="text-center">
                {user.publisherGroup != null && (
                  <Link
                    to={`/congregation/publisher-groups/${user.publisherGroup.id}/edit`}
                    className="hover:text-primary"
                  >
                    {user.publisherGroup.name}
                  </Link>
                )}
              </TableCell>
              <TableCell className="text-center max-sm:hidden">
                {user.email.includes('@placeholder.unitae.app') === false && (
                  <Link to={`mailto:${user.email}`} className="hover:text-primary">
                    <Mail className="inline size-4" />
                  </Link>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-stretch justify-end gap-2">
                  <Button asChild variant="ghost" size="icon">
                    <Link to={`/congregation/publishers/${user.id}/view`}>
                      <Eye className="size-4" />
                    </Link>
                  </Button>
                  {canManagePublisher && (
                    <Button asChild variant="ghost" size="icon">
                      <Link to={`./${user.id}/edit`}>
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
