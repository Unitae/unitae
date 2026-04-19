import { BarChart3, Eye } from 'lucide-react'
import { Link, redirect } from 'react-router'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/read-dashboard'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.board_read_dashboard_meta_title() }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.BoardValidator)) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const totalUsers = await db.user.count({
      where: { congregationId, active: true },
    })

    const documents = await db.boardDocument.findMany({
      where: {
        congregationId,
        // biome-ignore lint/style/useNamingConvention: prisma ORM
        OR: [
          { visibleFrom: { lte: new Date() }, visibleUntil: { gte: new Date() } },
          { visibleFrom: { lte: new Date() }, visibleUntil: null },
        ],
      },
      select: {
        id: true,
        title: true,
        isHighlighted: true,
        section: { select: { name: true } },
        viewedBy: { select: { id: true } },
      },
      orderBy: [{ section: { order: 'asc' } }, { order: 'asc' }],
    })

    const documentsWithStats = documents.map(doc => ({
      id: doc.id,
      title: doc.title,
      sectionName: doc.section.name,
      isHighlighted: doc.isHighlighted,
      readCount: doc.viewedBy.length,
      totalUsers,
      percentage: totalUsers > 0 ? Math.round((doc.viewedBy.length / totalUsers) * 100) : 0,
    }))

    return { documents: documentsWithStats, totalUsers }
  })
}

export default function ReadDashboardPage({ loaderData }: Route.ComponentProps) {
  const { documents } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.board_read_dashboard_title()} subtitle={m.board_read_dashboard_subtitle()} />

      {documents.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title={m.board_read_dashboard_empty_title()}
          description={m.board_read_dashboard_empty_description()}
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.board_read_dashboard_col_document()}</TableHead>
                  <TableHead className="max-sm:hidden">{m.board_read_dashboard_col_section()}</TableHead>
                  <TableHead className="text-center">{m.board_read_dashboard_col_read()}</TableHead>
                  <TableHead className="text-center max-sm:hidden">{m.board_read_dashboard_col_percentage()}</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">{m.board_documents_table_actions()}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map(doc => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <span className={doc.isHighlighted ? 'font-semibold' : ''}>{doc.title}</span>
                    </TableCell>
                    <TableCell className="max-sm:hidden">{doc.sectionName}</TableCell>
                    <TableCell className="text-center">
                      {doc.readCount}/{doc.totalUsers}
                    </TableCell>
                    <TableCell className="text-center max-sm:hidden">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-muted">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${doc.percentage}%` }} />
                        </div>
                        <span className="w-10 text-muted-foreground text-xs">{doc.percentage}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={`/board/documents/${doc.id}/read-status`}>
                          <Eye className="size-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
