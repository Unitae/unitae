import { redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/move-up'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/sections')
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardValidator])
  const canManageBoard = can(Role.BoardValidator)

  if (!canManageBoard) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const sections = await db.boardSection.findMany({ where: { congregationId }, orderBy: { order: 'asc' } })
    const currentSection = sections.find(section => section.id === requireParamId(params.sectionId, '/board'))
    if (currentSection == null) {
      session.flash('error', m.board_sections_move_not_found())
      return redirect('/board/sections', {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    }

    const orderedSections = sections
      .map((section, index) => ({
        id: section.id,
        order: index * 5 - (section.id === currentSection.id ? 7.5 : 0),
      }))
      .sort((a, b) => a.order - b.order)
      .map((section, index) => ({
        id: section.id,
        order: index * 5,
      }))

    for (const section of orderedSections) {
      await db.boardSection.update({
        where: {
          // biome-ignore lint/style/useNamingConvention: prisma compound key
          id_congregationId: { id: section.id, congregationId },
        },
        data: { order: section.order },
      })
    }

    session.flash('success', m.board_sections_move_up_success({ name: currentSection.name }))

    return redirect('/board/sections', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
