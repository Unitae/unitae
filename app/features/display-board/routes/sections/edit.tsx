import { Trash2 } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { Role } from '~/shared/types/role'
import { updateBoardSection } from '~/features/display-board/server/board-section.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { requireParamId } from '~/shared/utils/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.board_sections_edit_meta_title() }]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.BoardValidator)) {
    throw redirect('/')
  }

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

export default function EditSectionPage({ loaderData }: Route.ComponentProps) {
  const { section } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.board_sections_edit_title()}
        subtitle={m.board_sections_edit_subtitle()}
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
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{m.board_sections_edit_name_label()}</Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder={m.board_sections_edit_name_placeholder()}
                defaultValue={section.name ?? ''}
              />
            </div>
            <Button type="submit" className="w-fit">
              {m.board_sections_edit_submit()}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const form = await request.formData()
  const name = String(form.get('name'))

  if (name.length < 1) {
    session.flash('error', m.common_empty_fields_error())
    throw redirect('/board/sections/new')
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const section = await updateBoardSection(db, requireParamId(params.sectionId, '/board'), congregationId, {
      name: String(name),
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
