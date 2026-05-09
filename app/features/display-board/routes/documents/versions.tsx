import { parseWithZod } from '@conform-to/zod'
import { Download, History, RotateCcw } from 'lucide-react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { restoreVersionSchema } from '~/features/display-board/schemas/board-document.schema'
import { isDocumentOwnedByUploader } from '~/features/display-board/server/board-document.server'
import { restoreDocumentVersion } from '~/features/display-board/server/document-versions.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/versions'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.board_versions_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canUploadDocument = permissions.has(Permission.BoardUploader)
  const canManageBoard = permissions.has(Permission.BoardValidator)

  if (!canUploadDocument && !canManageBoard) {
    throw redirect('/')
  }

  const documentId = requireParamId(params.documentId, '/board/documents')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const document = await db.boardDocument.findUnique({
      where: {
        id_congregationId: { id: documentId, congregationId },
      },
      select: { id: true, title: true },
    })

    if (document == null) throw redirect('/board/documents')

    const ownsDocument = canUploadDocument && (await isDocumentOwnedByUploader(db, documentId, currentUser.id))
    if (!canManageBoard && !ownsDocument) throw redirect('/board/documents')

    const versions = await db.boardDocumentVersion.findMany({
      where: { documentId },
      include: {
        uploadedBy: {
          select: { firstname: true, lastname: true, anonymizedAt: true },
        },
      },
      orderBy: { versionNumber: 'desc' },
    })

    return { document, versions }
  })
}

function displayName(
  user: { firstname: string | null; lastname: string | null; anonymizedAt: Date | null } | null,
): string {
  if (user == null) return '—'
  if (user.anonymizedAt != null) return m.board_read_status_anonymized_user()
  return [user.firstname, user.lastname].filter(Boolean).join(' ') || '—'
}

export default function VersionsPage({ loaderData }: Route.ComponentProps) {
  const { document, versions } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.board_versions_title({ name: document.title })}
        subtitle={m.board_versions_subtitle({ count: versions.length })}
        breadcrumbs={[
          { label: m.sidebar_documents(), to: '/board/documents' },
          { label: m.board_versions_title({ name: document.title }) },
        ]}
        backTo="/board/documents"
        actions={
          <Button variant="outline" asChild>
            <Link to={`/board/documents/${document.id}/edit`}>{m.board_versions_back_to_edit()}</Link>
          </Button>
        }
      />

      {versions.length === 0 ? (
        <EmptyState
          icon={History}
          title={m.board_versions_empty_title()}
          description={m.board_versions_empty_description()}
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.board_versions_col_version()}</TableHead>
                  <TableHead className="max-sm:hidden">{m.board_versions_col_uploaded_by()}</TableHead>
                  <TableHead>{m.board_versions_col_date()}</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">{m.board_documents_table_actions()}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map(version => (
                  <TableRow key={version.id}>
                    <TableCell>v{version.versionNumber}</TableCell>
                    <TableCell className="max-sm:hidden">{displayName(version.uploadedBy)}</TableCell>
                    <TableCell>{new Date(version.createdAt).toLocaleDateString('fr-FR')}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" asChild>
                          <Link reloadDocument to={`/board/documents/${document.id}/view`}>
                            <Download className="size-4" />
                          </Link>
                        </Button>
                        <Form method="post">
                          <input type="hidden" name="versionId" value={version.id} />
                          <Button type="submit" variant="ghost" size="icon" title={m.board_versions_restore_tooltip()}>
                            <RotateCcw className="size-4" />
                          </Button>
                        </Form>
                      </div>
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

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canUploadDocument = permissions.has(Permission.BoardUploader)
  const canManageBoard = permissions.has(Permission.BoardValidator)

  if (!canUploadDocument && !canManageBoard) {
    throw redirect('/')
  }

  const session = await getSession(request.headers.get('Cookie'))
  const documentId = requireParamId(params.documentId, '/board/documents')
  const submission = parseWithZod(await request.formData(), { schema: restoreVersionSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { versionId } = submission.value

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser

    const ownsDocument = canUploadDocument && (await isDocumentOwnedByUploader(db, documentId, currentUser.id))
    if (!canManageBoard && !ownsDocument) throw redirect('/board/documents')

    const result = await restoreDocumentVersion(db, documentId, versionId, congregationId, currentUser.id)

    if (result == null) {
      session.flash('error', m.common_generic_error())
      return redirect(`/board/documents/${documentId}/versions`, {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    }

    session.flash('success', m.board_versions_restore_success({ version: result.versionNumber }))

    return redirect(`/board/documents/${documentId}/versions`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
