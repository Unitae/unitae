import { redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/move-up'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/sections')
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session } = await verifySession(request)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  if (!canManageBoard) {
    throw redirect('/')
  }

  const sections = await db.boardSection.findMany({ orderBy: { order: 'asc' } })
  const currentSection = sections.find(section => section.id === requireParamId(params.sectionId, '/board'))
  if (currentSection == null) {
    session.flash('error', `La section n'existe pas`)
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
      where: { id: section.id },
      data: { order: section.order },
    })
  }

  session.flash('success', `La section "${currentSection.name}" a été correctement déplacée vers le haut`)

  return redirect('/board/sections', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
