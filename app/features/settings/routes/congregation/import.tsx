import { type FileUpload, parseFormData } from '@mjackson/form-data-parser'
import { Upload } from 'lucide-react'
import { Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication'
import { validateImport } from '~/features/settings/server/import-congregation.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, requirePermission } from '~/shared/auth/route-context.server'
import { buildStorageKey, uploadFile } from '~/shared/infra/file-storage.server'
import { createLogger } from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import type { Route } from './+types/import'

const logger = createLogger('import-route')

// 500 MB max for import archives
const MAX_IMPORT_SIZE = 500 * 1024 * 1024

export const meta: Route.MetaFunction = () => {
  return [{ title: m.import_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.Admin)
  return null
}

export default function ImportPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.import_title()}
        subtitle={m.import_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_settings(), to: '/settings' },
          { label: m.settings_data_title(), to: '/settings/data' },
          { label: m.import_title() },
        ]}
      />

      <Form method="post" encType="multipart/form-data" className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{m.import_title()}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="archive">{m.import_file_label()}</Label>
            <Input id="archive" name="archive" type="file" accept=".unitae" required />
            <p className="text-muted-foreground text-xs">{m.import_file_hint()}</p>
          </CardContent>
        </Card>

        <SubmitButton>
          <Upload className="mr-2 size-4" />
          {m.import_submit()}
        </SubmitButton>
      </Form>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.Admin)

  const currentUser = context.get(currentAccountContext)
  const session = await getSession(request.headers.get('Cookie'))
  let uploadedFile: File | null = null

  const uploadHandler = async (fileUpload: FileUpload) => {
    if (fileUpload.fieldName !== 'archive') return

    const chunks: Uint8Array[] = []
    const reader = fileUpload.stream().getReader()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    const blob = new Blob(chunks as BlobPart[], { type: fileUpload.type })
    uploadedFile = new File([blob], fileUpload.name, { type: fileUpload.type })
    return uploadedFile
  }

  await parseFormData(request, { maxFileSize: MAX_IMPORT_SIZE }, uploadHandler)

  if (!uploadedFile || !(uploadedFile as File).name.endsWith('.unitae')) {
    session.flash('error', m.import_invalid_file())
    return redirect('/settings/data/import', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  const file = uploadedFile as File
  const buffer = Buffer.from(await file.arrayBuffer())
  const uuid = crypto.randomUUID()
  const storageKey = buildStorageKey(currentUser.congregationId, 'imports', `${uuid}.unitae`)

  await uploadFile(storageKey, buffer, 'application/zip')

  logger.info('Import archive uploaded', { storageKey, size: buffer.length })

  // Validate the archive
  try {
    const summary = await validateImport(storageKey, currentUser.congregationId)
    // Store summary in URL search params for the confirm page
    const params = new URLSearchParams({ storageKey, summary: JSON.stringify(summary) })
    return redirect(`/settings/data/import/confirm?${params.toString()}`)
  } catch (error) {
    logger.error('Import validation failed', { error })
    session.flash('error', m.import_invalid_file())
    return redirect('/settings/data/import', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }
}
