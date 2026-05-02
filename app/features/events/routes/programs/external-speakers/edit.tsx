import { getFormProps, getInputProps, getTextareaProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Archive, ArchiveRestore, ShieldAlert } from 'lucide-react'
import { z } from 'zod'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { externalSpeakerSchema } from '~/features/events/schemas/external-speaker.schema'
import {
  archiveExternalSpeaker,
  getExternalSpeaker,
  unarchiveExternalSpeaker,
  updateExternalSpeaker,
} from '~/features/events/server/external-speakers.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import { Role } from '~/shared/types/role'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Textarea } from '~/shared/ui/textarea'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.external_speakers_edit_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.ProgramManager)) throw redirect('/')

  const externalSpeakerId = requireParamId(params.externalSpeakerId, '/programs/external-speakers')

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const speaker = await getExternalSpeaker(db, externalSpeakerId, congregationId)
    if (!speaker) throw redirect('/programs/external-speakers')

    return {
      speaker: {
        id: speaker.id,
        name: speaker.name,
        congregationName: speaker.congregationName,
        phone: speaker.phone ?? '',
        email: speaker.email ?? '',
        notes: speaker.notes ?? '',
        archivedAt: speaker.archivedAt?.toISOString() ?? null,
        isIncomplete: speaker.congregationName === '',
      },
    }
  })
}

const intentSchema = z.object({ intent: z.enum(['update', 'archive', 'unarchive']) })

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.ProgramManager)) throw redirect('/')

  const currentUser = context.get(userContext)
  const externalSpeakerId = requireParamId(params.externalSpeakerId, '/programs/external-speakers')
  const session = await getSession(request.headers.get('Cookie'))
  const formData = await request.formData()
  const intent = intentSchema.safeParse({ intent: formData.get('intent') ?? 'update' })
  const requestedAction = intent.success ? intent.data.intent : 'update'

  return withScopeFromContext(context, async db => {
    if (requestedAction === 'archive') {
      await runArchive(() => archiveExternalSpeaker(db, externalSpeakerId, currentUser.congregationId, currentUser.id))
      session.flash('success', m.external_speakers_archive_success())
      return redirect('/programs/external-speakers', {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    }

    if (requestedAction === 'unarchive') {
      await runArchive(() =>
        unarchiveExternalSpeaker(db, externalSpeakerId, currentUser.congregationId, currentUser.id),
      )
      session.flash('success', m.external_speakers_unarchive_success())
      return redirect(`/programs/external-speakers/${externalSpeakerId}/edit`, {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    }

    const submission = parseWithZod(formData, { schema: externalSpeakerSchema })
    if (submission.status !== 'success') {
      return data(submission.reply(), { status: 400 })
    }

    try {
      await updateExternalSpeaker(db, externalSpeakerId, currentUser.congregationId, currentUser.id, submission.value)
    } catch (error) {
      if (error instanceof ConflictError) {
        return data(submission.reply({ formErrors: [m.external_speakers_duplicate_error()] }), { status: 409 })
      }
      throw error
    }

    session.flash('success', m.external_speakers_update_success())
    return redirect('/programs/external-speakers', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

async function runArchive(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation()
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error
  }
}

export default function ExternalSpeakerEditPage({ loaderData, actionData }: Route.ComponentProps) {
  const { speaker } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()
  useFocusError(actionData)
  const [form, fields] = useForm({
    lastResult: actionData,
    defaultValue: {
      name: speaker.name,
      congregationName: speaker.congregationName,
      phone: speaker.phone,
      email: speaker.email,
      notes: speaker.notes,
    },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: externalSpeakerSchema })
    },
  })

  const isArchived = speaker.archivedAt !== null

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={speaker.name}
        breadcrumbs={[
          { label: m.sidebar_programs(), to: '/programs' },
          { label: m.external_speakers_page_title(), to: '/programs/external-speakers' },
          { label: speaker.name },
        ]}
        backTo="/programs/external-speakers"
      />

      {speaker.isIncomplete && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 text-amber-900 text-sm dark:bg-amber-950 dark:text-amber-100">
          {m.external_speakers_incomplete_banner()}
        </div>
      )}

      {isArchived && (
        <div className="rounded-lg border bg-muted p-4 text-muted-foreground text-sm">
          {m.external_speakers_archived_banner()}
        </div>
      )}

      <Card>
        <CardContent>
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4" onChange={markDirty}>
            <input type="hidden" name="intent" value="update" />
            <div className="space-y-2">
              <Label htmlFor={fields.name.id}>{m.external_speakers_field_name()}</Label>
              <Input {...getInputProps(fields.name, { type: 'text' })} />
              {fields.name.errors && <p className="text-destructive text-sm">{fields.name.errors}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.congregationName.id}>{m.external_speakers_field_congregation()}</Label>
              <Input {...getInputProps(fields.congregationName, { type: 'text' })} />
              {fields.congregationName.errors && (
                <p className="text-destructive text-sm">{fields.congregationName.errors}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.phone.id}>{m.external_speakers_field_phone()}</Label>
              <Input {...getInputProps(fields.phone, { type: 'tel' })} />
              {fields.phone.errors && <p className="text-destructive text-sm">{fields.phone.errors}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.email.id}>{m.external_speakers_field_email()}</Label>
              <Input {...getInputProps(fields.email, { type: 'email' })} />
              {fields.email.errors && <p className="text-destructive text-sm">{fields.email.errors}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.notes.id}>{m.external_speakers_field_notes()}</Label>
              <Textarea {...getTextareaProps(fields.notes)} />
              {fields.notes.errors && <p className="text-destructive text-sm">{fields.notes.errors}</p>}
            </div>
            {form.errors && <p className="text-destructive text-sm">{form.errors}</p>}
            <SubmitButton className="mt-2">{m.common_save()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive text-lg">
            <ShieldAlert className="size-5" />
            {m.external_speakers_danger_zone()}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            {isArchived ? m.external_speakers_unarchive_description() : m.external_speakers_archive_description()}
          </p>
          {isArchived ? (
            <Form method="post" className="shrink-0">
              <input type="hidden" name="intent" value="unarchive" />
              <Button type="submit" variant="outline">
                <ArchiveRestore className="size-4" />
                {m.external_speakers_unarchive_action()}
              </Button>
            </Form>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="shrink-0">
                  <Archive className="size-4" />
                  {m.external_speakers_archive_action()}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{m.external_speakers_archive_confirm_title()}</AlertDialogTitle>
                  <AlertDialogDescription>{m.external_speakers_archive_confirm_body()}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                  <Form method="post">
                    <input type="hidden" name="intent" value="archive" />
                    <AlertDialogAction
                      type="submit"
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {m.external_speakers_archive_action()}
                    </AlertDialogAction>
                  </Form>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
