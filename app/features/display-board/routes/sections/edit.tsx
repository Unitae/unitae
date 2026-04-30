import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Trash2 } from 'lucide-react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { updateSectionSchema } from '~/features/display-board/schemas/board-section.schema'
import { updateBoardSection } from '~/features/display-board/server/board-section.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext, requireRole } from '~/shared/auth/route-context.server'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.board_sections_edit_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requireRole(permissions, Role.BoardValidator)

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const section = await db.boardSection.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: requireParamId(params.sectionId, '/board'), congregationId },
      },
    })

    if (section == null) throw redirect('/board/sections')

    return { section }
  })
}

export default function EditSectionPage({ loaderData, actionData }: Route.ComponentProps) {
  const { section } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()
  useFocusError(actionData)
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: updateSectionSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.board_sections_edit_title()}
        subtitle={m.board_sections_edit_subtitle()}
        breadcrumbs={[{ label: m.sidebar_sections(), to: '/board/sections' }, { label: m.board_sections_edit_title() }]}
        backTo="/board/sections"
        actions={
          <Button variant="destructive" size="icon" asChild>
            <Link to={`/board/sections/${section.id}/delete`} title={m.board_sections_delete_tooltip()}>
              <Trash2 className="size-4" />
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4" onChange={markDirty}>
            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.name.id}>{m.board_sections_edit_name_label()}</Label>
              <Input
                {...getInputProps(fields.name, { type: 'text' })}
                placeholder={m.board_sections_edit_name_placeholder()}
                defaultValue={section.name ?? ''}
              />
              {fields.name.errors && <p className="text-destructive text-sm">{fields.name.errors}</p>}
            </div>
            <SubmitButton className="w-fit">{m.board_sections_edit_submit()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), { schema: updateSectionSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { name } = submission.value

  return withScopeFromContext(context, async db => {
    const { congregationId, id: actorId } = context.get(userContext)
    const section = await updateBoardSection(db, requireParamId(params.sectionId, '/board'), congregationId, actorId, {
      name,
    })

    if (section == null) {
      session.flash('error', m.common_generic_error())

      return redirect('/board', {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    }

    session.flash('success', m.board_sections_edit_success({ name: section.name }))

    return redirect(`/board/sections/${section.id}/edit`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
