import { Form, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/shared/types/role'
import { deleteSectionWithFiles } from '~/features/display-board/server/document.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'

import type { Route } from './+types/delete'

export async function loader({ request, params }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardValidator])
  const canManageBoard = can(Role.BoardValidator)

  if (!canManageBoard) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
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

export async function action({ request, params }: Route.ActionArgs) {
  const { session, can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardValidator])
  const canManageBoard = can(Role.BoardValidator)

  if (!canManageBoard) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
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
