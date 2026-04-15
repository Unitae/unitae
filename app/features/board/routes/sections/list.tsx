import { ChevronDown, ChevronUp, FolderOpen, Pencil, Trash2 } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
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
  return [{ title: `Liste des sections du Tableau d'affichage - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardValidator])
  const canManageBoard = can(Role.BoardValidator)

  if (!canManageBoard) {
    logger.warn(`Tried to load board sections. User ID: ${currentUser.id}. Does NOT have rights to manage board.`)

    throw redirect('/')
  }

  logger.info(
    `Loading board sections. User ID: ${currentUser.id}. ${canManageBoard ? 'Has' : 'Does NOT have'} rights to manage board sections.`,
  )

  return withScope(congregationId, async db => {
    const sections = await db.boardSection.findMany({
      where: { congregationId },
      include: {
        documents: true,
      },
      orderBy: {
        order: 'asc',
      },
    })

    return { sections }
  })
}

export default function SectionListPage({ loaderData }: Route.ComponentProps) {
  const { sections } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sections"
        subtitle={m.board_sections_list_subtitle()}
        actions={
          <Button asChild>
            <Link to="./new">{m.board_sections_create_button()}</Link>
          </Button>
        }
      />

      {sections.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={m.board_sections_empty_title()}
          description={m.board_sections_empty_description()}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.board_sections_table_name()}</TableHead>
                <TableHead className="text-center max-sm:hidden">{m.board_sections_table_documents()}</TableHead>
                <TableHead className="text-center">{m.board_sections_table_position()}</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">{m.board_sections_table_actions()}</span>
                </TableHead>
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
                        <Button type="submit" variant="ghost" size="icon">
                          <ChevronUp className="size-4" />
                        </Button>
                      </Form>
                      <Form method="post" action={`/board/sections/${section.id}/move-down`}>
                        <Button type="submit" variant="ghost" size="icon">
                          <ChevronDown className="size-4" />
                        </Button>
                      </Form>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={`./${section.id}/edit`}>
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        className="text-destructive hover:text-destructive max-sm:hidden"
                      >
                        <Link to={`./${section.id}/delete`} title={m.board_sections_delete_tooltip()}>
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
