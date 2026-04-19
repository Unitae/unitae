import { Download, History, RotateCcw } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/shared/types/role'
import { deleteFile } from '~/features/display-board/server/document.server'
import { thumbnailQueue } from '~/features/display-board/server/thumbnail-queue.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/infra/db.server'
import { requireParamId } from '~/shared/utils/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/versions'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.board_versions_meta_title() }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardUploader, Role.BoardValidator])

  if (!can(Role.BoardUploader)) {
    throw redirect('/')
  }

  const documentId = requireParamId(params.documentId, '/board/documents')

  return withScope(congregationId, async db => {
    const document = await db.boardDocument.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: documentId, congregationId },
      },
      select: { id: true, title: true },
    })

    if (document == null) throw redirect('/board/documents')

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

export async function action({ request, params }: Route.ActionArgs) {
  const { session, currentUser, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.BoardUploader,
    Role.BoardValidator,
  ])

  if (!can(Role.BoardUploader)) {
    throw redirect('/')
  }

  const documentId = requireParamId(params.documentId, '/board/documents')
  const form = await request.formData()
  const versionId = Number(form.get('versionId'))

  return withScope(congregationId, async db => {
    const version = await db.boardDocumentVersion.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: versionId, congregationId },
      },
    })

    if (version == null || version.documentId !== documentId) {
      session.flash('error', m.common_generic_error())
      return redirect(`/board/documents/${documentId}/versions`, {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    }

    // Fetch current document to save as a new version before restoring
    const currentDoc = await db.boardDocument.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: documentId, congregationId },
      },
      select: { uri: true, thumbnailUri: true },
    })

    if (currentDoc?.uri) {
      const lastVersion = await db.boardDocumentVersion.findFirst({
        where: { documentId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      })

      await db.boardDocumentVersion.create({
        data: {
          documentId,
          uri: currentDoc.uri,
          thumbnailUri: currentDoc.thumbnailUri,
          versionNumber: (lastVersion?.versionNumber ?? 0) + 1,
          uploadedById: currentUser.id,
          congregationId,
        },
      })
    }

    // Restore: update URI, clear thumbnail (will be regenerated by worker)
    await db.boardDocument.update({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: documentId, congregationId },
      },
      data: {
        uri: version.uri,
        thumbnailUri: null,
      },
    })

    // Clean up old thumbnail if it was replaced
    if (currentDoc?.thumbnailUri) {
      await deleteFile({ uri: currentDoc.thumbnailUri })
    }

    // Enqueue thumbnail regeneration from the restored file
    await thumbnailQueue.add('generate-thumbnail', {
      congregationId,
      documentId,
      pdfStorageKey: version.uri,
    })

    session.flash('success', m.board_versions_restore_success({ version: version.versionNumber }))

    return redirect(`/board/documents/${documentId}/versions`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
