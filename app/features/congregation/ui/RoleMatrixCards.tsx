import { Form, Link } from 'react-router'
import type { MatrixGroup, MatrixMember } from '~/features/congregation/model/role-matrix.type'
import { groupLabel } from '~/features/congregation/ui/RoleMatrixTable'
import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'

// The matrix at phone width: a grid of dozens of 400px-wide columns is unusable, so below md
// each member is a card and each role a tappable chip — the same server action, no table. Bands
// stay as tiny section labels inside the card so the grouping survives the change of shape;
// folding does not apply here, since chips wrap instead of costing width.

const chipClass = 'inline-flex min-h-11 items-center rounded-full border px-3 text-sm transition-colors'

function MemberCard({
  member,
  groups,
  canManageRoles,
}: {
  member: MatrixMember
  groups: MatrixGroup[]
  canManageRoles: boolean
}) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border p-3">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-sm">
          {member.firstname} {member.lastname?.toLocaleUpperCase()}
        </span>
        {!member.hasAccount && <span className="text-muted-foreground text-xs">Pas de compte</span>}
      </span>

      {groups.map(group => (
        <div key={group.key} className="flex flex-col gap-1.5">
          <span className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">{groupLabel(group)}</span>
          <div className="flex flex-wrap gap-1.5">
            {group.columns.map(column => {
              const kind = member.seats[column.id]
              const isAssigned = kind !== undefined

              // A personal role's seat — and any responsable or adjoint seat — changes hands
              // on the organigram, never from a tap here.
              if (column.isSinglePerson || kind === 'leader' || kind === 'deputy') {
                return (
                  <Link
                    key={column.id}
                    to={`/congregation/roles/organigram?node=${column.id}`}
                    title={
                      column.isSinglePerson
                        ? m.congregation_roles_personal_managed()
                        : m.congregation_roles_seat_managed()
                    }
                    className={cn(
                      chipClass,
                      'border-dashed',
                      isAssigned ? 'text-foreground' : 'text-muted-foreground/60',
                    )}
                  >
                    {column.name}
                    {kind === 'leader' && <span className="pl-1 font-semibold text-primary text-xs">R</span>}
                    {kind === 'deputy' && <span className="pl-1 font-semibold text-primary text-xs">A</span>}
                  </Link>
                )
              }

              return (
                <Form method="post" preventScrollReset key={column.id}>
                  <input type="hidden" name="memberId" value={member.id} />
                  <input type="hidden" name="roleId" value={column.id} />
                  <input type="hidden" name="intent" value={isAssigned ? 'remove' : 'add'} />
                  <button
                    type="submit"
                    disabled={!canManageRoles || !member.hasAccount}
                    aria-label={`${isAssigned ? 'Retirer de' : 'Ajouter à'} ${column.name}`}
                    className={cn(
                      chipClass,
                      isAssigned
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:bg-accent',
                      (!canManageRoles || !member.hasAccount) && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    {column.name}
                    {kind === 'leader' && <span className="pl-1 text-xs">R</span>}
                    {kind === 'deputy' && <span className="pl-1 text-xs">A</span>}
                  </button>
                </Form>
              )
            })}
          </div>
        </div>
      ))}
    </li>
  )
}

export function RoleMatrixCards({
  groups,
  members,
  canManageRoles,
}: {
  groups: MatrixGroup[]
  members: MatrixMember[]
  canManageRoles: boolean
}) {
  if (members.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
        {m.congregation_roles_empty_members()}
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {members.map(member => (
        <MemberCard key={member.id} member={member} groups={groups} canManageRoles={canManageRoles} />
      ))}
    </ul>
  )
}
