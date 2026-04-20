import { Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { deleteSectionWithFiles } from '~/features/display-board/server/document.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

export function loader({ params, context }: Route.LoaderArgs) {
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

    if (section == null) {
      throw redirect('/board/sections')
    }

    return { section }
  })
}

export default function DeleteSectionPage({ loaderData }: Route.ComponentProps) {
  const { section } = loaderData

  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="flex flex-col items-center justify-center gap-6 pt-6">
        <p className="text-center text-muted-foreground">
          {m.board_sections_delete_confirmation({ name: section.name })}
        </p>
        <Form method="post">
          <Button type="submit" variant="destructive" title={m.board_sections_delete_tooltip()}>
            {m.board_sections_delete_button()}
          </Button>
        </Form>
      </CardContent>
    </Card>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.BoardValidator)) {
    throw redirect('/')
  }

  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const sectionId = requireParamId(params.sectionId, '/board')
    const section = await deleteSectionWithFiles(db, sectionId, congregationId)

    session.flash('success', m.board_sections_delete_success({ name: section.name }))

    return redirect('/board/sections', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
