import { unscopedDb } from '~/shared/infra/db.server'
import { getRoleDisplayName } from '~/shared/types/role'
import { formatPersonName, resolveAccountName } from '~/shared/utils/format-person-name'

/** What an audit line is about, as the row stores it. */
export interface AuditEntityRef {
  entityType: string | null
  entityId: number | null
}

type Where = { id: { in: number[] }; congregationId: number }
type Namer = (where: Where) => Promise<{ id: number; name: string | null }[]>

const person = (row: { firstname: string | null; lastname: string | null }) => formatPersonName(row, '') || null

/**
 * How each kind of object is named, by the model name the audit row stores. An account and a user are the same
 * object under its old and new names. The kinds left out (a goal, a part, a report) have no name of their own.
 */
const NAMERS: Record<string, Namer> = {
  User: accountNames,
  UserAccount: accountNames,
  Member: async where =>
    (await unscopedDb.member.findMany({ where, select: { id: true, firstname: true, lastname: true } })).map(row => ({
      id: row.id,
      name: person(row),
    })),
  Role: async where =>
    (await unscopedDb.role.findMany({ where, select: { id: true, key: true, name: true } })).map(row => ({
      id: row.id,
      name: getRoleDisplayName(row),
    })),
  Attribution: async where =>
    (
      await unscopedDb.attribution.findMany({ where, select: { id: true, territory: { select: { number: true } } } })
    ).map(row => ({ id: row.id, name: row.territory.number })),
  PioneerEnrolment: async where =>
    (
      await unscopedDb.pioneerEnrolment.findMany({
        where,
        select: { id: true, member: { select: { firstname: true, lastname: true } } },
      })
    ).map(row => ({ id: row.id, name: person(row.member) })),
  BoardDocument: async where =>
    (await unscopedDb.boardDocument.findMany({ where, select: { id: true, title: true } })).map(row => ({
      id: row.id,
      name: row.title,
    })),
  BoardDynamicDocumentSettings: async where =>
    (await unscopedDb.boardDynamicDocumentSettings.findMany({ where, select: { id: true, title: true } })).map(row => ({
      id: row.id,
      name: row.title,
    })),
  BoardSection: async where => unscopedDb.boardSection.findMany({ where, select: { id: true, name: true } }),
  Campaign: async where => unscopedDb.campaign.findMany({ where, select: { id: true, name: true } }),
  Territory: async where =>
    (await unscopedDb.territory.findMany({ where, select: { id: true, number: true } })).map(row => ({
      id: row.id,
      name: row.number,
    })),
  PublisherGroup: async where => unscopedDb.publisherGroup.findMany({ where, select: { id: true, name: true } }),
  EventTemplate: async where => unscopedDb.eventTemplate.findMany({ where, select: { id: true, name: true } }),
  TerritoryCardOverlay: async where =>
    unscopedDb.territoryCardOverlay.findMany({ where, select: { id: true, name: true } }),
}

async function accountNames(where: Where) {
  const accounts = await unscopedDb.userAccount.findMany({
    where,
    select: {
      id: true,
      email: true,
      firstname: true,
      lastname: true,
      member: { select: { firstname: true, lastname: true } },
    },
  })
  return accounts.map(account => ({ id: account.id, name: person(resolveAccountName(account)) ?? account.email }))
}

/** The kind the namers look an object up under: an account is read once whether a line says user or account. */
const lookupKind = (entityType: string) => (entityType === 'UserAccount' ? 'User' : entityType)

/**
 * The names of the objects a page of the audit log is about, keyed `Type:id`, read with one query per kind and within
 * the congregation. An object that is gone, or of a kind without a name, is left out: the line keeps its number.
 */
export async function findAuditEntityNames(
  congregationId: number,
  refs: readonly AuditEntityRef[],
): Promise<Map<string, string>> {
  const idsByKind = new Map<string, Set<number>>()
  for (const { entityType, entityId } of refs) {
    if (entityType == null || entityId == null || NAMERS[entityType] == null) continue
    const kind = lookupKind(entityType)
    idsByKind.set(kind, (idsByKind.get(kind) ?? new Set()).add(entityId))
  }

  const found = await Promise.all(
    [...idsByKind].map(async ([kind, ids]) => {
      const rows = await NAMERS[kind]({ id: { in: [...ids] }, congregationId })
      return [kind, new Map(rows.flatMap(row => (row.name ? [[row.id, row.name] as const] : [])))] as const
    }),
  )
  const namesByKind = new Map(found)

  const names = new Map<string, string>()
  for (const { entityType, entityId } of refs) {
    if (entityType == null || entityId == null) continue
    const name = namesByKind.get(lookupKind(entityType))?.get(entityId)
    if (name) names.set(`${entityType}:${entityId}`, name)
  }
  return names
}
