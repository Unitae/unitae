import { readState, replacementDate } from '~/features/display-board/model/read-state'
import { sectionAudience } from '~/features/display-board/model/section-audience'
import { getContentVersion } from '~/features/display-board/server/dynamic-documents.server'
import { notificationRecipientFilter } from '~/shared/auth/permissions.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'
import { comparePersonName } from '~/shared/utils/format-person-name'

/** Someone who may read the board: an active account, of a member who has not left. */
export interface BoardReader {
  accountId: number
  firstname: string | null
  lastname: string | null
  anonymized: boolean
  groupName: string | null
  roleIds: number[]
}

export interface DocumentReader extends BoardReader {
  viewedAt: Date | null
  /** Opened it, but before it was last replaced or its data last changed. */
  outdated: boolean
}

const rolesWithPermissions = {
  select: { role: { select: { id: true, permissions: { select: { permission: { select: { key: true } } } } } } },
} as const

/**
 * Everyone who may read the board, roles resolved in one query for the whole congregation: through
 * their account's roles or their member's identity roles, with the board right or « can do anything ».
 */
export async function listBoardReaders(db: TransactionClient, congregationId: number): Promise<BoardReader[]> {
  const accounts = await db.userAccount.findMany({
    where: { congregationId, ...notificationRecipientFilter },
    select: {
      id: true,
      firstname: true,
      lastname: true,
      anonymizedAt: true,
      roleAssignments: rolesWithPermissions,
      member: {
        select: {
          firstname: true,
          lastname: true,
          anonymizedAt: true,
          publisherGroup: { select: { name: true } },
          roleAssignments: rolesWithPermissions,
        },
      },
    },
  })

  return accounts.flatMap(account => {
    const roles = [...account.roleAssignments, ...(account.member?.roleAssignments ?? [])].map(a => a.role)
    const keys = new Set(roles.flatMap(role => role.permissions.map(p => p.permission.key)))
    if (!keys.has(Permission.CanViewBoard) && !keys.has(Permission.CanDoAnything)) return []
    return [
      {
        accountId: account.id,
        firstname: account.member?.firstname ?? account.firstname,
        lastname: account.member?.lastname ?? account.lastname,
        anonymized: (account.member?.anonymizedAt ?? account.anonymizedAt) != null,
        groupName: account.member?.publisherGroup?.name ?? null,
        roleIds: [...new Set(roles.map(role => role.id))],
      },
    ]
  })
}

export { sectionAudience }

async function findReadable(
  db: TransactionClient,
  { kind, id, congregationId }: { kind: 'pdf' | 'dynamic'; id: number; congregationId: number },
) {
  const section = { select: { name: true, visibilityRoles: { select: { roleId: true } } } }
  const views = { select: { userId: true, viewedAt: true } }
  if (kind === 'pdf') {
    const doc = await db.boardDocument.findFirst({
      where: { id, congregationId },
      select: {
        title: true,
        createdAt: true,
        section,
        views,
        versions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
    })
    return doc && { ...doc, changedAt: replacementDate(doc.createdAt, doc.versions[0]?.createdAt) }
  }
  const doc = await db.boardDynamicDocumentSettings.findFirst({
    where: { id, congregationId },
    select: {
      title: true,
      createdAt: true,
      dynamicType: true,
      dynamicRef: true,
      dynamicConfig: true,
      section,
      views,
    },
  })
  if (!doc) return null
  const changedAt = await getContentVersion(db, doc.dynamicType, doc.dynamicRef, congregationId, doc.dynamicConfig)
  return { ...doc, changedAt }
}

/**
 * Who, among the people who can see a document, has read what it shows now, and who has not; an
 * earlier read is marked as such. Reads by anyone outside that audience are not counted.
 */
export async function documentReads(
  db: TransactionClient,
  params: { kind: 'pdf' | 'dynamic'; id: number; congregationId: number; now: Date },
) {
  const doc = await findReadable(db, params)
  if (!doc) return null

  const audience = sectionAudience(
    await listBoardReaders(db, params.congregationId),
    doc.section.visibilityRoles.map(r => r.roleId),
  )
  const viewedAt = new Map(doc.views.map(view => [view.userId, view.viewedAt]))
  const read: DocumentReader[] = []
  const unread: DocumentReader[] = []
  for (const reader of [...audience].sort(comparePersonName)) {
    const opened = viewedAt.has(reader.accountId)
    const at = opened ? (viewedAt.get(reader.accountId) ?? null) : undefined
    const state = readState({ createdAt: doc.createdAt, changedAt: doc.changedAt, viewedAt: at, now: params.now })
    ;(state.unread ? unread : read).push({ ...reader, viewedAt: at ?? null, outdated: opened && state.unread })
  }

  return { title: doc.title, sectionName: doc.section.name, read, unread }
}
