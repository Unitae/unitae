import type { Prisma } from '~/database/generated/client'
import { VISIBLE_ITEM } from '~/features/events/model/visibility'
import {
  PART_ITEMS,
  PART_ITEMS_BY_DATE,
  SERVICE_ITEMS,
  SERVICE_ITEMS_BY_DATE,
} from '~/features/events/server/item-projection.server'
import { PART_CONFLICT_OF } from '~/features/events/server/item-rooms.queries'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getRoleDisplayName } from '~/shared/types/role'
import { accountDisplayName } from '~/shared/utils/display-name'

export interface UserConflictInRange {
  eventDate: Date
  assignmentName: string
  responsibleName: string | null
}

// The responsible of the item's own schedule template: the role that fills and publishes that schedule (plan §10,
// read here since 6a-0). Shared between the two `findMany` calls so the query shape stays in sync.
const responsibleRoleSelect = {
  key: true,
  name: true,
  members: {
    select: {
      user: {
        select: {
          firstname: true,
          lastname: true,
          member: { select: { firstname: true, lastname: true } },
        },
      },
    },
  },
  // Roles given by hand sit on publisher records since 2.12, not on accounts.
  memberAssignments: { select: { member: { select: { firstname: true, lastname: true } } } },
} satisfies Prisma.RoleSelect

const conflictSelect = {
  name: true,
  event: { select: { startDate: true } },
  schedule: { select: { scheduleTemplate: { select: { responsibleRole: { select: responsibleRoleSelect } } } } },
} satisfies Prisma.ItemSelect

type ResponsibleRole = Prisma.RoleGetPayload<{ select: typeof responsibleRoleSelect }>

// `responsibleName` names the holders of the item's schedule-template responsible, through `accountDisplayName`
// so a linked Member name wins over the account fallback fields. A schedule without a template, or a template without
// a responsible, returns `null` so the UI can show a generic fallback line.
export async function listUserConflictsInRange(
  db: TransactionClient,
  memberId: number,
  startDate: Date,
  endDate: Date,
): Promise<UserConflictInRange[]> {
  const [partConflicts, serviceConflicts] = await Promise.all([
    db.item.findMany({
      where: {
        ...PART_ITEMS,
        // Drafts are invisible to publisher- and manager-facing conflict surfaces alike; managers spot draft
        // conflicts via the events-list amber badge and the release-blocking error.
        ...VISIBLE_ITEM,
        // A conflict is its room's (parallel rooms): the room that holds them, flagged.
        ...PART_CONFLICT_OF(memberId),
        event: { startDate: { lte: endDate }, endDate: { gte: startDate } },
      },
      select: conflictSelect,
      orderBy: PART_ITEMS_BY_DATE,
    }),
    db.item.findMany({
      where: {
        ...SERVICE_ITEMS,
        ...VISIBLE_ITEM,
        hasConflict: true,
        assigneeId: memberId,
        event: { startDate: { lte: endDate }, endDate: { gte: startDate } },
      },
      select: conflictSelect,
      orderBy: SERVICE_ITEMS_BY_DATE,
    }),
  ])

  const merged: UserConflictInRange[] = [...partConflicts, ...serviceConflicts].map(a => ({
    eventDate: a.event.startDate,
    assignmentName: a.name,
    responsibleName: resolveResponsibleName(a.schedule?.scheduleTemplate?.responsibleRole ?? null),
  }))

  merged.sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime())
  return merged
}

// This line exists so an absentee knows who to reach, so it resolves through the responsible
// role to the people actually seated in it — on an account or on a publisher record, as permissions
// resolve them — rather than naming the role. A role with nobody in
// it falls back to the role's own name: "contact the Responsable VCM" is still more use than
// the generic no-responsible line, and it hints at the gap the settings page warns about.
// Names are deterministically ordered so the modal reads the same across renders.
function resolveResponsibleName(role: ResponsibleRole | null): string | null {
  if (role == null) return null

  const names = [
    ...role.members.map(seat => accountDisplayName(seat.user)),
    ...role.memberAssignments.map(seat => accountDisplayName(seat.member)),
  ].filter(name => name.length > 0)

  if (names.length === 0) {
    const roleName = getRoleDisplayName(role)
    return roleName.length > 0 ? roleName : null
  }

  names.sort((a, b) => a.localeCompare(b))
  return [...new Set(names)].join(', ')
}
