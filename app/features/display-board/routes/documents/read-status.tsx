import { CheckCircle, XCircle } from 'lucide-react'
import { redirect } from 'react-router'
import * as m from '~/paraglide/messages'
import { permissionsContext, requireRole, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { Role } from '~/shared/types/role'
import { Card, CardContent } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/read-status'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.board_read_status_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)

  requireRole(permissions, Role.BoardValidator)

  const { congregationId } = currentUser
  const documentId = requireParamId(params.documentId, '/board/documents')

  audit({
    action: AuditAction.BoardReadStatusViewed,
    congregationId,
    actorId: currentUser.id,
    entityType: 'BoardDocument',
    entityId: documentId,
  })

  return withScopeFromContext(context, async db => {
    const document = await db.boardDocument.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: documentId, congregationId },
      },
      select: {
        id: true,
        title: true,
        viewedBy: {
          select: { id: true, firstname: true, lastname: true, anonymizedAt: true },
        },
      },
    })

    if (document == null) throw redirect('/board/documents')

    const allUsers = await db.user.findMany({
      where: { congregationId, active: true },
      select: { id: true, firstname: true, lastname: true, anonymizedAt: true },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    })

    const viewedIds = new Set(document.viewedBy.map(u => u.id))
    const readUsers = allUsers.filter(u => viewedIds.has(u.id))
    const unreadUsers = allUsers.filter(u => !viewedIds.has(u.id))

    return {
      document: { id: document.id, title: document.title },
      readUsers,
      unreadUsers,
      readCount: readUsers.length,
      totalCount: allUsers.length,
    }
  })
}

function displayName(user: { firstname: string | null; lastname: string | null; anonymizedAt: Date | null }): string {
  if (user.anonymizedAt != null) return m.board_read_status_anonymized_user()
  return [user.firstname, user.lastname].filter(Boolean).join(' ') || '—'
}

export default function ReadStatusPage({ loaderData }: Route.ComponentProps) {
  const { document, readUsers, unreadUsers, readCount, totalCount } = loaderData
  const percentage = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.board_read_status_title({ name: document.title })}
        subtitle={m.board_read_status_subtitle({ read: readCount, total: totalCount, percentage })}
        breadcrumbs={[
          { label: m.sidebar_documents(), to: '/board/documents' },
          { label: m.board_read_status_title({ name: document.title }) },
        ]}
        backTo="/board/documents"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-4 flex items-center gap-2 font-semibold">
              <CheckCircle className="size-5 text-green-600" />
              {m.board_read_status_read_heading({ count: readCount })}
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.board_read_status_user_column()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readUsers.map(user => (
                  <TableRow key={user.id}>
                    <TableCell>{displayName(user)}</TableCell>
                  </TableRow>
                ))}
                {readUsers.length === 0 && (
                  <TableRow>
                    <TableCell className="text-center text-muted-foreground">{m.board_read_status_nobody()}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-4 flex items-center gap-2 font-semibold">
              <XCircle className="size-5 text-destructive" />
              {m.board_read_status_unread_heading({ count: unreadUsers.length })}
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.board_read_status_user_column()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unreadUsers.map(user => (
                  <TableRow key={user.id}>
                    <TableCell>{displayName(user)}</TableCell>
                  </TableRow>
                ))}
                {unreadUsers.length === 0 && (
                  <TableRow>
                    <TableCell className="text-center text-muted-foreground">
                      {m.board_read_status_everybody()}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
