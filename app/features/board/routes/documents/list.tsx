import { ChevronDown, ChevronUp, Eye, FileText, Pencil, Trash2 } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { DocumentVisibility } from '~/features/board/ui/DocumentVisibility'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Liste des documents du Tableau d'affichage - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardUploader])
  const canUploadDocument = can(Role.BoardUploader)

  if (!canUploadDocument) {
    logger.warn(`Tried to load board documents. User ID: ${currentUser.id}. Does NOT have rights to upload document.`)

    throw redirect('/')
  }

  logger.info(
    `Loading board documents. User ID: ${currentUser.id}. ${canUploadDocument ? 'Has' : 'Does NOT have'} rights to upload document.`,
  )

  return withScope(congregationId, async db => {
    const documents = await db.boardDocument.findMany({
      where: { congregationId },
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
  })
}

export default function DocumentListPage({ loaderData }: Route.ComponentProps) {
  const { documents } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Documents"
        subtitle={m.board_documents_list_subtitle()}
        actions={
          <Button asChild>
            <Link to="./new">{m.board_documents_upload_button()}</Link>
          </Button>
        }
      />

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={m.board_documents_empty_title()}
          description={m.board_documents_empty_description()}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.board_documents_table_name()}</TableHead>
                <TableHead>
                  <span className="max-sm:hidden">{m.board_documents_table_section()}</span>
                  <span className="hidden max-sm:inline" aria-hidden="true">
                    Sec.
                  </span>
                </TableHead>
                <TableHead className="text-center max-sm:hidden">{m.board_documents_table_views()}</TableHead>
                <TableHead className="text-center">
                  <span className="max-sm:hidden">{m.board_documents_table_visibility()}</span>
                  <span className="hidden max-sm:inline" aria-hidden="true">
                    Vis.
                  </span>
                </TableHead>
                <TableHead className="text-center">
                  <span className="max-sm:hidden">{m.board_documents_table_position()}</span>
                  <span className="hidden max-sm:inline" aria-hidden="true">
                    Pos.
                  </span>
                </TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">{m.board_documents_table_actions()}</span>
                </TableHead>
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
                        <Button type="submit" variant="ghost" size="icon">
                          <ChevronUp className="size-4" />
                        </Button>
                      </Form>
                      <Form method="post" action={`./${document.id}/move-down`}>
                        <Button type="submit" variant="ghost" size="icon">
                          <ChevronDown className="size-4" />
                        </Button>
                      </Form>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild>
                        <Link reloadDocument to={`./${document.id}/view`}>
                          <Eye className="size-4" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={`./${document.id}/edit`}>
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        className="text-destructive hover:text-destructive max-sm:hidden"
                      >
                        <Link to={`./${document.id}/delete`} title={m.board_documents_delete_tooltip()}>
                          <Trash2 className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
