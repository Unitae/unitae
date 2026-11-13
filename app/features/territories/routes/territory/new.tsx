import { parseWithZod } from '@conform-to/zod/v4'
import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { getPhoneTerritoryActive } from '~/features/settings/index.server'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { createTerritorySchema } from '~/features/territories/schemas/territory.schema'
import { getBaseMap } from '~/features/territories/server/base-map.server'
import { computeNextTerritoryNumber } from '~/features/territories/server/compute-next-territory-number.server'
import { createTerritory } from '~/features/territories/server/create-territory.server'
import { getEditorCenter } from '~/features/territories/server/territory-editor.queries'
import { editorRefusal } from '~/features/territories/server/territory-editor-refusal.server'
import { type EditorActionData, TerritoryEditor } from '~/features/territories/ui/editor/TerritoryEditor'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { LimitService } from '~/shared/domain/limits.server'
import { Permission } from '~/shared/types/permission'
import { PageTopbar } from '~/shared/ui/PageTopbar'
import { handleAppError } from '~/shared/utils/handle-app-error.server'

import type { Route } from './+types/new'

/** The types a territory can take, in the order the menu offers them. */
const KINDS = [
  TerritoryKindKey.Classical,
  TerritoryKindKey.Commerces,
  TerritoryKindKey.Hotel,
  TerritoryKindKey.Phone,
  TerritoryKindKey.Univ,
]

export const meta: Route.MetaFunction = () => [{ title: m.territories_new_meta_title() }]

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageTerritories)

  return withScopeFromContext(context, async (db, congregationId) => {
    const phone = await getPhoneTerritoryActive(db, congregationId)
    const map = await getBaseMap(db, congregationId)
    const center = map == null ? null : await getEditorCenter(db, congregationId)
    const kinds = KINDS.filter(kind => phone || kind !== TerritoryKindKey.Phone)
    // The next free number of each type, as « Créer en lot » offers it.
    const numbers = await Promise.all(kinds.map(kind => computeNextTerritoryNumber(db, congregationId, kind)))
    const suggestions = Object.fromEntries(kinds.map((kind, index) => [kind, numbers[index]]))
    return { kinds, map, center, suggestions }
  })
}

export default function NewTerritoryPage({ loaderData, actionData }: Route.ComponentProps) {
  // One block: the territories layout spaces its children, and the editor must sit right under the top bar.
  return (
    <div>
      <PageTopbar
        className="mb-3 md:mb-0"
        trail={[{ label: m.sidebar_territories(), to: '/territories' }, { label: m.territory_editor_new_heading() }]}
      />
      <TerritoryEditor
        mode="new"
        territory={{
          id: null,
          number: loaderData.suggestions[TerritoryKindKey.Classical] ?? '',
          type: TerritoryKindKey.Classical,
          notes: '',
        }}
        suggestions={loaderData.suggestions}
        saved={[]}
        kinds={loaderData.kinds}
        map={loaderData.map}
        center={loaderData.center}
        cancelTo="/territories"
        result={actionData}
      />
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageTerritories)

  const submission = parseWithZod(await request.formData(), { schema: createTerritorySchema })
  if (submission.status !== 'success') {
    return data<EditorActionData>({ numberError: submission.error?.number?.[0] }, { status: 400 })
  }

  const { number, type, entrances, reassignments } = submission.value
  const congregation = context.get(congregationContext)
  const { id: actorId } = context.get(currentAccountContext)
  const session = await getSession(request.headers.get('Cookie'))

  let territory: { id: number; number: string }
  try {
    // Outside the transaction: a refused creation leaves no half-made territory behind.
    territory = await withScopeFromContext(context, async db => {
      await new LimitService(db, congregation).errorIfWouldGoOverLimit('territories')
      return createTerritory(db, {
        number,
        type,
        entranceIds: entrances,
        reassignments,
        congregationId: congregation.id,
        actorId,
      })
    })
  } catch (error) {
    // Answered as data, not a redirect: the editor keeps the entrances chosen and says what to fix.
    const refusal = editorRefusal(error, number)
    if (refusal?.kind === 'number-taken')
      return data<EditorActionData>({ numberError: refusal.message }, { status: 409 })
    if (refusal?.kind === 'entrance-taken') {
      return data<EditorActionData>({ formError: refusal.message, taken: refusal.entrances }, { status: 409 })
    }
    return handleAppError(error, session, '/territories/territory/new')
  }

  session.flash('success', m.territory_editor_created_flash({ number: territory.number }))
  return redirect(`/territories/territory/${territory.id}/view`, {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
