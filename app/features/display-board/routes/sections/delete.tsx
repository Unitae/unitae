import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { deleteSectionWithFiles } from '~/features/display-board/server/document.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { DeleteConfirmation } from '~/shared/ui/DeleteConfirmation'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Supprimer une section — Unitae' }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.BoardValidator)

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const section = await db.boardSection.findUnique({
      where: {
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
    <DeleteConfirmation
      title={m.board_sections_delete_confirmation({ name: section.name })}
      submitLabel={m.board_sections_delete_button()}
      cancelTo="/board/sections"
    >
      <p>{section.name}</p>
    </DeleteConfirmation>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.BoardValidator)

  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
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
