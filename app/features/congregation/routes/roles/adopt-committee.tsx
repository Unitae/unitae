import { Link, redirect } from 'react-router'
import { RolesTabs } from '~/features/congregation/ui/RolesTabs'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { adoptServiceCommittee, proposeCommitteeAdoption } from '~/shared/domain/organigram-adoption.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/adopt-committee'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Reprendre le comité de service — Unitae' }]
}

const ORGANIGRAM = '/congregation/roles/organigram'

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanManageRoles)) throw redirect(ORGANIGRAM)

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const proposal = await proposeCommitteeAdoption(db, congregationId)
    // Nothing to confirm once the committee is in the chart, and re-running would map a second time.
    if (proposal.alreadyAdopted) throw redirect(ORGANIGRAM)
    return proposal
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanManageRoles)) throw redirect(ORGANIGRAM)

  const formData = await request.formData()

  // `getAll` rather than Conform: the form is a fixed list of paired fields, and Conform's
  // flattening does not turn bare repeated names into arrays — it parsed to nothing, the action
  // redirected as if it had succeeded, and the adoption silently did not happen.
  const postKeys = formData.getAll('postKey').map(String)
  const fromRoleIds = formData.getAll('fromRoleId').map(String)
  if (postKeys.length === 0 || postKeys.length !== fromRoleIds.length) {
    throw new Error(`adopt-committee: ${postKeys.length} posts against ${fromRoleIds.length} choices`)
  }

  // An empty value means "start this post empty", which is a real answer, not a missing one.
  const choices = postKeys.map((key, index) => ({
    postKey: key,
    fromRoleId: Number(fromRoleIds[index]) || null,
  }))

  return withScopeFromContext(context, async db => {
    const { congregationId, id: actorId } = context.get(currentAccountContext)
    await adoptServiceCommittee(db, choices, congregationId, actorId)
    return redirect(ORGANIGRAM)
  })
}

export default function AdoptCommitteePage({ loaderData }: Route.ComponentProps) {
  const { posts, candidates } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reprendre le comité de service"
        subtitle="Rattacher ce que vous avez déjà créé aux trois fonctions du comité"
        breadcrumbs={[{ label: m.sidebar_assembly() }, { label: 'Organigramme' }]}
      />

      <RolesTabs />

      <form method="post" className="flex max-w-2xl flex-col gap-6">
        <p className="text-muted-foreground text-sm">
          Chaque assemblée a un comité de service composé de trois anciens. Votre organigramme utilise pour l’instant
          des services que vous avez nommés vous-même. Indiquez lequel correspond à chaque fonction : les personnes, les
          permissions et les services rattachés seront repris. Rien n’est supprimé.
        </p>

        <ul className="flex flex-col divide-y rounded-xl border">
          {posts.map(post => (
            <li key={post.key} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4">
              <span className="font-medium text-sm sm:w-64 sm:shrink-0">{post.name}</span>
              <input type="hidden" name="postKey" value={post.key} />
              <select
                name="fromRoleId"
                aria-label={`Service correspondant à ${post.name}`}
                defaultValue={post.suggestedRoleId == null ? '' : String(post.suggestedRoleId)}
                className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {/* A post with nothing to carry over is normal — most charts have no secretary
                    node at all — so "start empty" is offered as a first-class answer. */}
                <option value="">— Commencer à vide —</option>
                {candidates.map(candidate => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          <Button type="submit">Reprendre</Button>
          <Button asChild variant="ghost">
            <Link to={ORGANIGRAM}>Annuler</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
