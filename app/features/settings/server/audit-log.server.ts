import { unscopedDb } from '~/shared/infra/db.server'
import { combineLocalDateTime } from '~/shared/utils/event-time'
import { formatPersonName } from '~/shared/utils/format-person-name'

interface AuditLogQueryParams {
  congregationId: number
  page: number
  pageSize: number
  /** The congregation's: a day of the period starts and ends at its midnight. */
  timeZone: string
  action?: string
  /** First and last day of the period, both included (yyyy-mm-dd). */
  from?: string
  to?: string
  /** A person, by their name or their address. */
  search?: string
}

const contains = (text: string) => ({ contains: text, mode: 'insensitive' as const })

/** The day after `day` (yyyy-mm-dd), for an end that includes the whole last day. */
function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

/** The accounts whose name or record's name holds the text: who a search for a person means. */
async function accountsNamed(congregationId: number, text: string): Promise<number[]> {
  const accounts = await unscopedDb.userAccount.findMany({
    where: {
      congregationId,
      OR: [
        { firstname: contains(text) },
        { lastname: contains(text) },
        { member: { firstname: contains(text) } },
        { member: { lastname: contains(text) } },
      ],
    },
    select: { id: true },
  })
  return accounts.map(account => account.id)
}

/**
 * A page of the congregation's audit log, the newest first: one action, a period of whole days in the congregation's
 * time zone, a person. The page is kept between the first and the last, and each line names who did it after their
 * record or their account; the address stays for an account that is gone.
 */
export async function findAuditLogsPaginated(params: AuditLogQueryParams) {
  const { congregationId, pageSize, timeZone } = params
  const where: Record<string, unknown> = { congregationId }

  if (params.action) where.action = params.action
  if (params.from || params.to) {
    where.createdAt = {
      ...(params.from ? { gte: combineLocalDateTime(params.from, '00:00', timeZone) } : {}),
      ...(params.to ? { lt: combineLocalDateTime(nextDay(params.to), '00:00', timeZone) } : {}),
    }
  }
  if (params.search) {
    where.OR = [
      { actorEmail: contains(params.search) },
      { actorId: { in: await accountsNamed(congregationId, params.search) } },
    ]
  }

  const count = await unscopedDb.auditLog.count({ where })
  const pages = Math.ceil(count / pageSize)
  const page = Math.min(Math.max(1, Number.isFinite(params.page) ? Math.trunc(params.page) : 1), Math.max(1, pages))
  const logs = await unscopedDb.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  })

  const actorIds = [...new Set(logs.flatMap(log => (log.actorId != null ? [log.actorId] : [])))]
  const actors = actorIds.length
    ? await unscopedDb.userAccount.findMany({
        where: { id: { in: actorIds } },
        select: {
          id: true,
          email: true,
          firstname: true,
          lastname: true,
          member: { select: { firstname: true, lastname: true } },
        },
      })
    : []
  const byId = new Map(actors.map(actor => [actor.id, actor]))

  return {
    count,
    page,
    pageSize,
    pages,
    logs: logs.map(log => {
      const actor = log.actorId != null ? byId.get(log.actorId) : undefined
      return {
        ...log,
        actorName: actor ? formatPersonName(actor.member ?? actor, '') || null : null,
        actorEmail: log.actorEmail ?? actor?.email ?? null,
      }
    }),
  }
}
