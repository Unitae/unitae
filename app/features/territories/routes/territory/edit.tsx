import { parseWithZod } from '@conform-to/zod/v4'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { updateTerritorySchema } from '~/features/territories/schemas/territory.schema'
import { getEditorCenter, getTerritoryEditor } from '~/features/territories/server/territory-editor.queries'
import { editorRefusal } from '~/features/territories/server/territory-editor-refusal.server'
import { updateTerritory } from '~/features/territories/server/update-territory.server'
import { type EditorActionData, TerritoryEditor } from '~/features/territories/ui/editor/TerritoryEditor'
import { DeleteTerritoryDialog, TerritoryMenu, type TerritoryTarget } from '~/features/territories/ui/TerritoryActions'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { PageTopbar } from '~/shared/ui/PageTopbar'
import { getOptionalEnv } from '~/shared/utils/env.server'
import { handleAppError } from '~/shared/utils/handle-app-error.server'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: loaderData ? m.territory_editor_meta_edit({ number: loaderData.territory.number }) : 'Unitae' },
]

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageTerritories)
  const id = requireParamId(params.territoryId, '/territories')
  const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY') ?? null

  return withScopeFromContext(context, async (db, congregationId) => {
    const territory = await getTerritoryEditor(db, congregationId, id)
    if (territory == null) throw redirect('/territories')
    // Where the map opens when none of the territory's entrances has a position.
    const placed = territory.entrances.some(entrance => entrance.latitude != null)
    const center = placed || apiKey == null ? null : await getEditorCenter(db, congregationId)
    return { territory, apiKey, center }
  })
}

export default function EditTerritoryPage({ loaderData, actionData }: Route.ComponentProps) {
  const { territory, apiKey, center } = loaderData
  const [deleting, setDeleting] = useState<TerritoryTarget | null>(null)
  const view = `/territories/territory/${territory.id}/view`
  const target: TerritoryTarget = {
    id: territory.id,
    number: territory.number,
    hasHistory: territory.hasHistory,
    entrances: territory.entrances.length,
  }

  // One block: the territories layout spaces its children, and the editor must sit right under the top bar.
  return (
    <div>
      <PageTopbar
        className="mb-3 md:mb-0"
        trail={[
          { label: m.sidebar_territories(), to: '/territories' },
          { label: territory.number, to: view },
          { label: m.territory_editor_crumb_edit() },
        ]}
        actions={
          <>
            <Button asChild variant="ghost" size="icon" title={m.territories_menu_pdf()}>
              <a href={`/territories/territory/${territory.id}/pdf`} aria-label={m.territories_menu_pdf()}>
                <Download aria-hidden="true" />
              </a>
            </Button>
            <TerritoryMenu territory={target} canManage compact onDelete={setDeleting} />
          </>
        }
      />
      <TerritoryEditor
        mode="edit"
        territory={territory}
        saved={territory.entrances}
        kinds={[territory.type]}
        apiKey={apiKey}
        center={center}
        cancelTo={view}
        result={actionData}
      />
      <DeleteTerritoryDialog
        territory={deleting}
        onOpenChange={open => {
          if (!open) setDeleting(null)
        }}
      />
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageTerritories)

  const submission = parseWithZod(await request.formData(), { schema: updateTerritorySchema })
  if (submission.status !== 'success') {
    return data<EditorActionData>({ numberError: submission.error?.number?.[0] }, { status: 400 })
  }

  const { number, entrances, reassignments, notes } = submission.value
  const { congregationId, id: actorId } = context.get(currentAccountContext)
  const id = requireParamId(params.territoryId, '/territories')
  const session = await getSession(request.headers.get('Cookie'))

  let saved: { number: string }
  try {
    // Outside the transaction: a refused save (an entrance taken meanwhile, a number in use) leaves nothing behind.
    saved = await withScopeFromContext(context, db =>
      updateTerritory(db, id, congregationId, actorId, { number, entranceIds: entrances, reassignments, notes }),
    )
  } catch (error) {
    // Answered as data, not a redirect: the editor keeps its changes and says what to fix.
    const refusal = editorRefusal(error, number ?? '')
    if (refusal?.kind === 'number-taken')
      return data<EditorActionData>({ numberError: refusal.message }, { status: 409 })
    if (refusal?.kind === 'entrance-taken') {
      return data<EditorActionData>({ formError: refusal.message, taken: refusal.entrances }, { status: 409 })
    }
    return handleAppError(error, session, `/territories/territory/${id}/edit`)
  }
  session.flash('success', m.territory_editor_saved_flash({ number: saved.number }))
  return redirect(`/territories/territory/${id}/view`, { headers: { 'Set-Cookie': await commitSession(session) } })
}
