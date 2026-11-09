import { useState } from 'react'
import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { deleteBoardSection, loadSectionDeletion } from '~/features/display-board/server/board-section-delete.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { DeleteConfirmation } from '~/shared/ui/DeleteConfirmation'
import { Label } from '~/shared/ui/label'
import { RadioGroup, RadioGroupItem } from '~/shared/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

export const meta: Route.MetaFunction = () => [{ title: `${m.board_sections_delete_button()} - Unitae` }]

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanConfigureBoardSections)

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const deletion = await loadSectionDeletion(db, requireParamId(params.sectionId, '/board/documents'), congregationId)
    if (deletion == null) throw redirect('/board/documents')
    return deletion
  })
}

function holdsText(count: number) {
  if (count === 0) return m.board_section_delete_empty()
  return count === 1 ? m.board_section_delete_holds_one() : m.board_section_delete_holds_many({ count })
}

/** What happens to what it holds: moved to another section by default, or deleted with it. */
function ContentsChoice({ targets }: { targets: { id: number; name: string }[] }) {
  const [choice, setChoice] = useState<'move' | 'delete'>(targets.length > 0 ? 'move' : 'delete')
  return (
    <RadioGroup
      name="contents"
      value={choice}
      onValueChange={value => setChoice(value as 'move' | 'delete')}
      className="gap-2.5 text-left"
    >
      {targets.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <RadioGroupItem id="contents-move" value="move" />
            <Label htmlFor="contents-move" className="font-normal">
              {m.board_section_delete_move()}
            </Label>
          </div>
          {choice === 'move' && (
            <Select name="moveTo" defaultValue={String(targets[0].id)}>
              <SelectTrigger className="ml-6 w-[calc(100%-1.5rem)]" aria-label={m.board_section_delete_move()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targets.map(target => (
                  <SelectItem key={target.id} value={String(target.id)}>
                    {target.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
      <div className="flex items-start gap-2">
        <RadioGroupItem id="contents-delete" value="delete" className="mt-0.5" />
        <Label htmlFor="contents-delete" className="flex flex-col items-start gap-0.5 font-normal">
          {m.board_section_delete_drop()}
          <span className="text-muted-foreground text-xs">{m.board_section_delete_drop_help()}</span>
        </Label>
      </div>
    </RadioGroup>
  )
}

export default function DeleteSectionPage({ loaderData }: Route.ComponentProps) {
  const { section, documents, targets } = loaderData
  return (
    <DeleteConfirmation
      title={m.board_section_delete_title({ name: section.name })}
      submitLabel={m.board_sections_delete_button()}
      cancelTo="/board/documents"
      fields={documents > 0 ? <ContentsChoice targets={targets} /> : undefined}
    >
      <p>{holdsText(documents)}</p>
    </DeleteConfirmation>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanConfigureBoardSections)
  const session = await getSession(request.headers.get('Cookie'))
  const form = await request.formData()
  // Its documents move unless deleting them was chosen; an empty section posts no choice.
  const moveTo = form.get('contents') === 'move' ? Number(form.get('moveTo')) : null

  return withScopeFromContext(context, async db => {
    const { congregationId, id: actorId } = context.get(currentAccountContext)
    const sectionId = requireParamId(params.sectionId, '/board/documents')
    const result = await deleteBoardSection(db, { sectionId, congregationId, actorId, moveTo })
    if (result == null) {
      session.flash('error', m.common_generic_error())
    } else if (result.moved > 0) {
      session.flash('success', m.board_section_delete_success_moved({ name: result.name, count: result.moved }))
    } else {
      session.flash('success', m.board_sections_delete_success({ name: result.name }))
    }
    return redirect('/board/documents', { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
