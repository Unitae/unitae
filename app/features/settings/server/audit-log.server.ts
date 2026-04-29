import { unscopedDb } from '~/shared/infra/db.server'

interface AuditLogQueryParams {
  congregationId: number
  page: number
  pageSize: number
  action?: string
  dateFrom?: string
  dateTo?: string
}

const ENTITY_URL_PATTERNS: Record<string, (id: number) => string> = {
  Territory: id => `/territories/territory/${id}/edit`,
  Attribution: id => `/territories/attributions/${id}/edit`,
  Building: id => `/territories/building/${id}/edit`,
  User: id => `/settings/users/${id}/edit`,
  PublisherGroup: id => `/publishers/groups/${id}/edit`,
  ProgrammeTemplate: id => `/settings/congregation/templates/${id}`,
  Event: id => `/programs/events/${id}`,
  BoardDocument: id => `/board/documents/${id}/edit`,
}

async function resolveEntityUrls(
  logs: Array<{ entityType: string | null; entityId: number | null }>,
  congregationId: number,
): Promise<Map<string, string>> {
  const byType = new Map<string, number[]>()
  for (const log of logs) {
    if (!log.entityType || log.entityId == null) continue
    if (!ENTITY_URL_PATTERNS[log.entityType]) continue
    const ids = byType.get(log.entityType) ?? []
    ids.push(log.entityId)
    byType.set(log.entityType, ids)
  }

  const existenceMap = new Map<string, string>()

  await Promise.all(
    [...byType.entries()].map(async ([type, ids]) => {
      const uniqueIds = [...new Set(ids)]
      let existingIds: number[] = []

      if (type === 'Territory') {
        const rows = await unscopedDb.territory.findMany({
          where: { id: { in: uniqueIds }, congregationId },
          select: { id: true },
        })
        existingIds = rows.map(r => r.id)
      } else if (type === 'Attribution') {
        const rows = await unscopedDb.attribution.findMany({
          where: { id: { in: uniqueIds }, congregationId },
          select: { id: true },
        })
        existingIds = rows.map(r => r.id)
      } else if (type === 'Building') {
        const rows = await unscopedDb.building.findMany({
          where: { id: { in: uniqueIds }, congregationId },
          select: { id: true },
        })
        existingIds = rows.map(r => r.id)
      } else if (type === 'User') {
        const rows = await unscopedDb.user.findMany({
          where: { id: { in: uniqueIds }, congregationId },
          select: { id: true },
        })
        existingIds = rows.map(r => r.id)
      } else if (type === 'PublisherGroup') {
        const rows = await unscopedDb.publisherGroup.findMany({
          where: { id: { in: uniqueIds }, congregationId },
          select: { id: true },
        })
        existingIds = rows.map(r => r.id)
      } else if (type === 'ProgrammeTemplate') {
        const rows = await unscopedDb.programmeTemplate.findMany({
          where: { id: { in: uniqueIds }, congregationId },
          select: { id: true },
        })
        existingIds = rows.map(r => r.id)
      } else if (type === 'Event') {
        const rows = await unscopedDb.event.findMany({
          where: { id: { in: uniqueIds }, congregationId },
          select: { id: true },
        })
        existingIds = rows.map(r => r.id)
      } else if (type === 'BoardDocument') {
        const rows = await unscopedDb.boardDocument.findMany({
          where: { id: { in: uniqueIds }, congregationId },
          select: { id: true },
        })
        existingIds = rows.map(r => r.id)
      }

      const urlFn = ENTITY_URL_PATTERNS[type]
      for (const id of existingIds) {
        existenceMap.set(`${type}:${id}`, urlFn(id))
      }
    }),
  )

  return existenceMap
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

  const actorIds = [...new Set(logs.map(l => l.actorId).filter((id): id is number => id != null))]
  const actors =
    actorIds.length > 0
      ? await unscopedDb.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, email: true, anonymizedAt: true },
        })
      : []
  const actorMap = new Map(actors.map(a => [a.id, a]))

  const entityUrlMap = await resolveEntityUrls(logs, params.congregationId)

  const logsWithMeta = logs.map(log => {
    const actor = log.actorId != null ? actorMap.get(log.actorId) : null
    const actorEmail = log.actorEmail ?? (actor ? actor.email : null)
    const actorAnonymized = actor ? actor.anonymizedAt != null : false
    const entityUrl =
      log.entityType && log.entityId != null ? (entityUrlMap.get(`${log.entityType}:${log.entityId}`) ?? null) : null

    return {
      ...log,
      actorEmail,
      actorAnonymized,
      entityUrl,
    }
  })

  return { count, logs: logsWithMeta }
}
