import { getFormProps, getInputProps, getTextareaProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { externalSpeakerSchema } from '~/features/events/schemas/external-speaker.schema'
import { createExternalSpeaker } from '~/features/events/server/external-speakers.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { Card, CardContent } from '~/shared/ui/card'
import { FormActions } from '~/shared/ui/FormActions'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Textarea } from '~/shared/ui/textarea'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.external_speakers_new_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.ExternalSpeakerManager)) throw redirect('/')
  return null
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.ExternalSpeakerManager)) throw redirect('/')

  const currentUser = context.get(currentAccountContext)
  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), { schema: externalSpeakerSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  return withScopeFromContext(context, async db => {
    try {
      await createExternalSpeaker(db, currentUser.congregationId, currentUser.id, submission.value)
    } catch (error) {
      if (error instanceof ConflictError) {
        return data(submission.reply({ formErrors: [m.external_speakers_duplicate_error()] }), { status: 409 })
      }
      throw error
    }

    session.flash('success', m.external_speakers_create_success())
    return redirect('/programs/external-speakers', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

export default function ExternalSpeakerNewPage({ actionData }: Route.ComponentProps) {
  const { blocker, markDirty } = useUnsavedChanges()
  useFocusError(actionData)
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: externalSpeakerSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.external_speakers_new_title()}
        breadcrumbs={[
          { label: m.sidebar_programs(), to: '/programs' },
          { label: m.external_speakers_page_title(), to: '/programs/external-speakers' },
          { label: m.external_speakers_new_title() },
        ]}
        backTo="/programs/external-speakers"
      />

      <Card>
        <CardContent>
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4" onChange={markDirty}>
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
            <FormActions>
              <SubmitButton>{m.common_save()}</SubmitButton>
            </FormActions>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
