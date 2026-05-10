import { unscopedDb } from '~/shared/infra/db.server'

interface AuditLogQueryParams {
  congregationId: number
  page: number
  pageSize: number
  action?: string
  dateFrom?: string
  dateTo?: string
}

export async function findAuditLogsPaginated(params: AuditLogQueryParams) {
  const where: Record<string, unknown> = { congregationId: params.congregationId }

  if (params.action) {
    where.action = params.action
  }

  if (params.dateFrom || params.dateTo) {
    const createdAt: Record<string, Date> = {}
    if (params.dateFrom) createdAt.gte = new Date(params.dateFrom)
    if (params.dateTo) createdAt.lte = new Date(params.dateTo)
    where.createdAt = createdAt
  }

  const [count, logs] = await Promise.all([
    unscopedDb.auditLog.count({ where }),
    unscopedDb.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
  ])

  const missingEmailIds = [
    ...new Set(logs.filter(l => !l.actorEmail && l.actorId != null).map(l => l.actorId as number)),
  ]

  const actorEmailMap: Map<number, string> = new Map()
  if (missingEmailIds.length > 0) {
    const users = await unscopedDb.userAccount.findMany({
      where: { id: { in: missingEmailIds } },
      select: { id: true, email: true },
    })
    for (const user of users) actorEmailMap.set(user.id, user.email)
  }

  return {
    count,
    logs: logs.map(log => ({
      ...log,
      actorEmail: log.actorEmail ?? (log.actorId != null ? (actorEmailMap.get(log.actorId) ?? null) : null),
    })),
  }
}
