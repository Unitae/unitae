import type { SeatKind } from '~/shared/domain/organigram.queries'
import type { TransactionClient } from '~/shared/infra/db.server'

/** A holder of a schedule's responsible role: on the publisher record, or on an account without one. */
export interface ScheduleResponsibleHolder {
  memberId: number | null
  accountId: number | null
  firstname: string | null
  lastname: string | null
  seat: SeatKind
}

/** A schedule's responsible as the event page shows it (D37): the role, then its holders by seat. */
export interface ScheduleResponsible {
  role: { key: string; name: string | null }
  holders: ScheduleResponsibleHolder[]
}

const SEAT_ORDER: Record<string, number> = { leader: 0, deputy: 1, member: 2 }

/**
 * The responsible of each of these roles (D37, spec §5.4): every seat, on the record (MemberRoleAssignment) or on an
 * account without one (UserRoleAssignment) — the titulaire, then the adjoints, then the other holders, by name.
 * Members who left hold nothing. In a fixed number of queries whatever the roles.
 */
export async function listScheduleResponsibles(
  db: TransactionClient,
  roleIds: readonly number[],
  congregationId: number,
): Promise<Map<number, ScheduleResponsible>> {
  if (roleIds.length === 0) return new Map()
  const ids = [...new Set(roleIds)]
  const [roles, onRecords, onAccounts] = await Promise.all([
    db.role.findMany({ where: { id: { in: ids }, congregationId }, select: { id: true, key: true, name: true } }),
    db.memberRoleAssignment.findMany({
      where: { roleId: { in: ids }, congregationId, member: { leftAt: null } },
      select: { roleId: true, kind: true, member: { select: { id: true, firstname: true, lastname: true } } },
    }),
    db.userRoleAssignment.findMany({
      where: { roleId: { in: ids }, congregationId, user: { memberId: null } },
      select: { roleId: true, kind: true, user: { select: { id: true, firstname: true, lastname: true } } },
    }),
  ])
  const holders: (ScheduleResponsibleHolder & { roleId: number })[] = [
    ...onRecords.map(({ roleId, kind, member }) => ({
      roleId,
      memberId: member.id,
      accountId: null,
      firstname: member.firstname,
      lastname: member.lastname,
      seat: kind as SeatKind,
    })),
    ...onAccounts.map(({ roleId, kind, user }) => ({
      roleId,
      memberId: null,
      accountId: user.id,
      firstname: user.firstname,
      lastname: user.lastname,
      seat: kind as SeatKind,
    })),
  ].sort(
    (a, b) =>
      (SEAT_ORDER[a.seat] ?? 3) - (SEAT_ORDER[b.seat] ?? 3) ||
      (a.lastname ?? '').localeCompare(b.lastname ?? '') ||
      (a.firstname ?? '').localeCompare(b.firstname ?? ''),
  )
  return new Map(
    roles.map(role => [
      role.id,
      {
        role: { key: role.key, name: role.name },
        holders: holders.filter(holder => holder.roleId === role.id).map(({ roleId: _role, ...holder }) => holder),
      },
    ]),
  )
}
