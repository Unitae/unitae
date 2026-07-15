import type { TransactionClient } from '~/shared/infra/db.server'
import { accountDisplayName } from '~/shared/utils/display-name'

export interface UserConflictInRange {
  eventDate: Date
  assignmentName: string
  responsibleName: string | null
}

// Read the assignments a member has on programme events that overlap the
// given date range and whose hasConflict flag is set. Used by the days-off
// create action to build the "you have assignments during this absence"
// modal. `responsibleName` resolves through accountDisplayName so the
// linked Member's name wins over the account fallback fields when both
// exist; untemplated events (or templates without a responsible) return
// null so the UI can show a generic fallback line.
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
        event: {
          select: {
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
          },
        },
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
        event: {
          select: {
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
          },
        },
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

type TemplateWithResponsibles =
  | {
      responsibles: Array<{
        user: {
          firstname: string | null
          lastname: string | null
          member: { firstname: string; lastname: string } | null
        }
      }>
    }
  | null
  | undefined

function resolveResponsibleName(template: TemplateWithResponsibles): string | null {
  const user = template?.responsibles?.[0]?.user
  if (!user) return null
  const name = accountDisplayName(user)
  return name.length > 0 ? name : null
}
