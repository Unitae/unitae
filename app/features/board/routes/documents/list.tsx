import { ChevronDown, ChevronUp, Eye, Pencil, Trash2 } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { DocumentVisibility } from '~/features/board/ui/DocumentVisibility'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Liste des documents du Tableau d'affichage - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canUploadDocument = await verifyRole(request, Role.BoardUploader)

  if (!canUploadDocument) {
    logger.warn(`Tried to load board documents. User ID: ${currentUser.id}. Does NOT have rights to upload document.`)

    throw redirect('/')
  }

  logger.info(
    `Loading board documents. User ID: ${currentUser.id}. ${canUploadDocument ? 'Has' : 'Does NOT have'} rights to upload document.`,
  )

  const documents = await db.boardDocument.findMany({
    include: {
      section: true,
      viewedBy: {
        select: {
          id: true,
        },
      },
    },
    orderBy: [
      {
        section: { order: 'asc' },
      },
      { order: 'asc' },
    ],
  })

  return { documents }
}

export default function DocumentListPage({ loaderData }: Route.ComponentProps) {
  const { documents } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Documents"
        subtitle="Liste de toutes les documents du tableau d'affichage"
        actions={
          <Button asChild>
            <Link to="./new">Téléverser un document</Link>
          </Button>
        }
      />

      {documents.length === 0 ? (
        <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center">
          <p className="text-muted-foreground">Il n'y a aucun document pour le moment !</p>
          <p className="text-muted-foreground">
            Lorsque des documents seront ajoutés, ils apparaîtront ici. Pour en ajouter, cliquez sur le bouton
            ci-dessus.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead className="max-sm:w-[110px] max-sm:text-center">
                Sec<span className="hidden max-sm:inline">.</span>
                <span className="max-sm:hidden">tion</span>
              </TableHead>
              <TableHead className="w-[150px] text-center max-sm:hidden">Vues uniques</TableHead>
              <TableHead className="w-[150px] text-center max-sm:w-14">
                Vis<span className="hidden max-sm:inline">.</span>
                <span className="max-sm:hidden">ibilité</span>
              </TableHead>
              <TableHead className="w-[150px] text-center max-sm:w-14">
                Pos<span className="hidden max-sm:inline">.</span>
                <span className="max-sm:hidden">ition</span>
              </TableHead>
              <TableHead className="w-[150px] max-sm:w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map(document => (
              <TableRow key={document.id}>
                <TableCell>{document.title}</TableCell>
                <TableCell className="max-sm:hidden">{document.section.name}</TableCell>
                <TableCell className="hidden max-sm:table-cell">{(document.section.order ?? 0) / 5 + 1}</TableCell>
                <TableCell className="text-center max-sm:hidden">{document.viewedBy.length}</TableCell>
                <TableCell className="text-center">
                  <DocumentVisibility document={document} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    <Form method="post" action={`./${document.id}/move-up`}>
                      <Button type="submit" variant="ghost" size="icon" className="size-8 text-primary">
                        <ChevronUp className="size-4" />
                      </Button>
                    </Form>
                    <Form method="post" action={`./${document.id}/move-down`}>
                      <Button type="submit" variant="ghost" size="icon" className="size-8 text-primary">
                        <ChevronDown className="size-4" />
                      </Button>
                    </Form>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" asChild className="size-8 text-primary">
                      <Link reloadDocument to={`./${document.id}/view`}>
                        <Eye className="size-4" />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" asChild className="size-8 text-primary">
                      <Link to={`./${document.id}/edit`}>
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      className="size-8 text-destructive hover:text-destructive max-sm:hidden"
                    >
                      <Link to={`./${document.id}/delete`} title="Supprimer complètement le document">
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
