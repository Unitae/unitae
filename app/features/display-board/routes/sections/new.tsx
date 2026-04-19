import { Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { Role } from '~/shared/types/role'
import { createBoardSection } from '~/features/display-board/server/board-section.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Création de section sur Tableau d'affichage - Unitae` }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.BoardValidator)) {
    throw redirect('/')
  }

  return null
}

export default function NewSectionPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.board_sections_new_title()} subtitle={m.board_sections_new_subtitle()} />

      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{m.board_sections_new_name_label()}</Label>
              <Input id="name" name="name" type="text" placeholder={m.board_sections_new_name_placeholder()} />
            </div>
            <Button type="submit" className="w-fit">
              {m.board_sections_new_submit()}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const form = await request.formData()
  const name = String(form.get('name'))

  if (name.length < 1) {
    session.flash('error', m.common_empty_fields_error())
    throw redirect('/board/sections/new')
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const section = await createBoardSection(db, { name: String(name), congregationId })

    if (section == null) {
      session.flash('error', m.common_generic_error())

      return redirect('/board', {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    }

    session.flash('success', m.board_sections_new_success({ name: section.name }))

    return redirect(`/board/sections/${section.id}/edit`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
