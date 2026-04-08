import { BadgeCheck, BadgeMinus, IdCard, Pencil, UserPlus } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'

import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'

import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/user-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Réglages - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canManageUser = await verifyRole(request, Role.SettingsUserManager)
  const canViewPublishers = await verifyRole(request, Role.PublisherViewer)
  const canManagePublishers = await verifyRole(request, Role.PublisherManager)

  if (!canManageUser) {
    logger.warn(`Tried to load users. User ID: ${currentUser.id}. Does NOT have rights to manage users.`)

    throw redirect('/')
  }

  logger.info(
    `Loading users. User ID: ${currentUser.id}. ${canManageUser ? 'Has' : 'Does NOT have'} rights to manage users.`,
  )

  const users = await db.user.findMany({
    include: {
      congregationRoles: { include: { role: true } },
    },
    orderBy: [
      {
        lastname: 'asc',
      },
      {
        firstname: 'asc',
      },
    ],
  })

  return {
    users: users.map(user => ({
      email: user.email.includes('@placeholder.unitae.app') ? null : user.email,
      roles: user.congregationRoles.map(cr => cr.role),
      id: user.id,
      active: user.active,
      firstname: user.firstname,
      lastname: user.lastname,
      isAdmin: user.congregationRoles.some(cr => cr.role.key === 'admin'),
      isPublisher: user.isPublisher,
    })),
    roles: {
      canViewPublishers,
      canManageUser,
      canManagePublishers,
    },
  }
}

export default function SettingsLayout({ loaderData }: Route.ComponentProps) {
  const { users, roles } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Utilisateurs"
        subtitle="Liste de tous les utilisateurs de Unitae"
        actions={
          <Button asChild>
            <Link to="./new">Nouvel utilisateur</Link>
          </Button>
        }
      />

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prénom</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead className="max-sm:hidden">Email</TableHead>
              <TableHead className="text-center">Proclamateur</TableHead>
              <TableHead className="text-center max-sm:hidden">Droits</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(user => (
              <TableRow key={user.id}>
                <TableCell>{user.firstname}</TableCell>
                <TableCell>{user.lastname?.toLocaleUpperCase()}</TableCell>
                <TableCell className="max-sm:hidden">{user.email ?? '-'}</TableCell>
                <TableCell className="text-center">
                  {user.isPublisher ? (
                    roles.canViewPublishers ? (
                      <Link
                        to={`/congregation/publishers/${user.id}/view`}
                        title="Voir la fiche proclamateur de cet utilisateur"
                        className="text-primary"
                      >
                        <IdCard className="inline size-4" />
                      </Link>
                    ) : (
                      <IdCard className="inline size-4 text-primary" />
                    )
                  ) : (
                    roles.canManagePublishers && (
                      <Form method="POST" action={`./${user.id}/make-publisher`}>
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          title="Créer automatiquement une fiche proclamateur pour cet utilisateur"
                        >
                          <UserPlus className="size-4" />
                        </Button>
                      </Form>
                    )
                  )}
                </TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {user.isAdmin ? (
                    <Badge variant="default" title="Utilisateur ayant les droits administrateur">
                      <BadgeCheck className="mr-1 size-3" /> Admin
                    </Badge>
                  ) : user.roles.length > 0 ? (
                    <Badge variant="secondary" title="Utilisateur qui possède des droits supplémentaires">
                      <BadgeMinus className="mr-1 size-3" /> Droits
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" asChild>
                      <Link to={`./${user.id}/edit`}>
                        <Pencil className="size-4" />
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
