import type { Prisma } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { accountDisplayName } from '~/shared/utils/display-name'

export interface UserConflictInRange {
  eventDate: Date
  assignmentName: string
  responsibleName: string | null
}

// Shared between the two `findMany` calls so the query shape stays in sync.
const eventWithResponsiblesSelect = {
  startDate: true,
  template: {
    select: {
      responsibles: {
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
    db.programmePartAssignment.findMany({
      where: {
        hasConflict: true,
        OR: [{ assigneeId: memberId }, { assistantId: memberId }],
        event: { startDate: { lte: endDate }, endDate: { gte: startDate } },
      },
      select: {
        name: true,
        event: { select: eventWithResponsiblesSelect },
      },
    }),
    db.programmeServiceRoleAssignment.findMany({
      where: {
        hasConflict: true,
        assigneeId: memberId,
        event: { startDate: { lte: endDate }, endDate: { gte: startDate } },
      },
      select: {
        name: true,
        event: { select: eventWithResponsiblesSelect },
      },
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

// A template can have any number of responsibles. Every named responsible
// is surfaced so the absentee knows who to reach, deterministically ordered
// by display name so the modal reads the same across renders.
function resolveResponsibleName(template: EventWithResponsibles['template']): string | null {
  const responsibles = template?.responsibles ?? []
  if (responsibles.length === 0) return null

  const names = responsibles.map(r => accountDisplayName(r.user)).filter(name => name.length > 0)
  if (names.length === 0) return null

  names.sort((a, b) => a.localeCompare(b))
  return names.join(', ')
}
