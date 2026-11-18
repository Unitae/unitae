import type { Prisma } from '~/database/generated/client'
import { EventStatus } from '~/features/events/model/event-status.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getRoleDisplayName } from '~/shared/types/role'
import { accountDisplayName } from '~/shared/utils/display-name'

export interface UserConflictInRange {
  eventDate: Date
  assignmentName: string
  responsibleName: string | null
}

// One meeting's clashes in the programme's order: the date sort below is stable, so parts then services, each in theirs.
const PROGRAMME_ORDER = [{ event: { startDate: 'asc' } }, { order: 'asc' }, { id: 'asc' }] as const satisfies (
  | Prisma.EventPartOrderByWithRelationInput
  | Prisma.EventServicePartOrderByWithRelationInput
)[]

// Shared between the two `findMany` calls so the query shape stays in sync.
const eventWithResponsiblesSelect = {
  startDate: true,
  template: {
    select: {
      responsibles: {
        select: {
          role: {
            select: {
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
            },
          },
        },
      },
    },
  },
} satisfies Prisma.EventSelect

type EventWithResponsibles = Prisma.EventGetPayload<{ select: typeof eventWithResponsiblesSelect }>

// `responsibleName` resolves through `accountDisplayName` so a template
// responsible's linked Member name wins over the account fallback fields.
// Untemplated events (or templates with no responsible assigned) return
// `null` so the UI can show a generic fallback line.
export async function listUserConflictsInRange(
  db: TransactionClient,
  memberId: number,
  startDate: Date,
  endDate: Date,
): Promise<UserConflictInRange[]> {
  const [partConflicts, serviceConflicts] = await Promise.all([
    db.eventPart.findMany({
      where: {
        hasConflict: true,
        OR: [{ assigneeId: memberId }, { assistantId: memberId }],
        // Drafts are invisible to publisher- and manager-facing conflict
        // surfaces alike; managers spot draft conflicts via the events-list
        // amber badge and the release-blocking error.
        event: { startDate: { lte: endDate }, endDate: { gte: startDate }, status: EventStatus.Released },
      },
      select: {
        name: true,
        event: { select: eventWithResponsiblesSelect },
      },
      orderBy: PROGRAMME_ORDER,
    }),
    db.eventServicePart.findMany({
      where: {
        hasConflict: true,
        assigneeId: memberId,
        event: { startDate: { lte: endDate }, endDate: { gte: startDate }, status: EventStatus.Released },
      },
      select: {
        name: true,
        event: { select: eventWithResponsiblesSelect },
      },
      orderBy: PROGRAMME_ORDER,
    }),
  ])

  const merged: UserConflictInRange[] = [...partConflicts, ...serviceConflicts].map(a => ({
    eventDate: a.event.startDate,
    assignmentName: a.name,
    responsibleName: resolveResponsibleName(a.event.template),
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
function resolveResponsibleName(template: EventWithResponsibles['template']): string | null {
  const responsibles = template?.responsibles ?? []
  if (responsibles.length === 0) return null

  const names = responsibles
    .flatMap(r => [
      ...r.role.members.map(seat => accountDisplayName(seat.user)),
      ...r.role.memberAssignments.map(seat => accountDisplayName(seat.member)),
    ])
    .filter(name => name.length > 0)

  if (names.length === 0) {
    const roleNames = responsibles.map(r => getRoleDisplayName(r.role)).filter(name => name.length > 0)
    if (roleNames.length === 0) return null
    roleNames.sort((a, b) => a.localeCompare(b))
    return roleNames.join(', ')
  }

  names.sort((a, b) => a.localeCompare(b))
  return [...new Set(names)].join(', ')
}
