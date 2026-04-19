import { Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { Role } from '~/shared/types/role'
import { deleteDynamicDocument } from '~/features/display-board/server/board-document.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { requireParamId } from '~/shared/utils/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'

import type { Route } from './+types/delete'

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.BoardValidator)) {
    throw redirect('/')
  }

  const dynamicId = requireParamId(params.dynamicId, '/board')

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const settings = await db.boardDynamicDocumentSettings.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: dynamicId, congregationId },
      },
    })

    if (!settings) throw redirect('/board/documents')
    return { settings }
  })
}

export default function DeleteDynamicDocumentPage({ loaderData }: Route.ComponentProps) {
  const { settings } = loaderData

  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="flex flex-col items-center justify-center gap-6 pt-6">
        <p className="text-center text-muted-foreground">
          {m.board_dynamic_delete_confirmation({ name: settings.title })}
        </p>
        <Form method="post">
          <Button type="submit" variant="destructive">
            {m.board_dynamic_delete_button()}
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
  const dynamicId = requireParamId(params.dynamicId, '/board')

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const settings = await deleteDynamicDocument(db, dynamicId, congregationId)

    session.flash('success', m.board_dynamic_delete_success({ name: settings.title }))

    return redirect('/board/documents', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
