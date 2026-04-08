import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Liste des sections du Tableau d'affichage - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  if (!canManageBoard) {
    logger.warn(`Tried to load board sections. User ID: ${currentUser.id}. Does NOT have rights to manage board.`)

    throw redirect('/')
  }

  logger.info(
    `Loading board sections. User ID: ${currentUser.id}. ${canManageBoard ? 'Has' : 'Does NOT have'} rights to manage board sections.`,
  )

  const sections = await db.boardSection.findMany({
    include: {
      documents: true,
    },
    orderBy: {
      order: 'asc',
    },
  })

  return { sections }
}

export default function SectionListPage({ loaderData }: Route.ComponentProps) {
  const { sections } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sections"
        subtitle="Liste de toutes les sections du tableau d'affichage"
        actions={
          <Button asChild>
            <Link to="./new">Créer une section</Link>
          </Button>
        }
      />

      {sections.length === 0 ? (
        <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center">
          <p className="text-muted-foreground">Il n'y a aucune section pour le moment !</p>
          <p className="text-muted-foreground">
            Lorsque des sections seront crées, elles apparaîtront ici. Pour en ajouter, cliquez sur le bouton ci-dessus.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead className="w-[150px] text-center max-sm:hidden">Documents</TableHead>
              <TableHead className="w-[150px] text-center max-sm:w-14">Position</TableHead>
              <TableHead className="w-[150px] max-sm:w-14" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections.map(section => (
              <TableRow key={section.id}>
                <TableCell>{section.name}</TableCell>
                <TableCell className="text-center max-sm:hidden">{section.documents.length}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    <Form method="post" action={`/board/sections/${section.id}/move-up`}>
                      <Button type="submit" variant="ghost" size="icon" className="size-8 text-primary">
                        <ChevronUp className="size-4" />
                      </Button>
                    </Form>
                    <Form method="post" action={`/board/sections/${section.id}/move-down`}>
                      <Button type="submit" variant="ghost" size="icon" className="size-8 text-primary">
                        <ChevronDown className="size-4" />
                      </Button>
                    </Form>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" asChild className="size-8 text-primary">
                      <Link to={`./${section.id}/edit`}>
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      className="size-8 text-destructive hover:text-destructive max-sm:hidden"
                    >
                      <Link to={`./${section.id}/delete`} title="Supprimer complètement la section">
                        <Trash2 className="size-4" />
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
