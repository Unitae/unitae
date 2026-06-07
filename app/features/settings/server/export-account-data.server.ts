import type { TransactionClient } from '~/shared/infra/db.server'

interface UserDataExport {
  exportDate: string
  exportVersion: string
  user: Record<string, unknown>
  permissions: Record<string, unknown>[]
  publisherActivities: Record<string, unknown>[]
  attributions: Record<string, unknown>[]
  publisherGroup: Record<string, unknown> | null
  eventsCreated: Record<string, unknown>[]
  boardDocumentsViewed: Record<string, unknown>[]
  boardDocumentVersionUploads: Record<string, unknown>[]
  consentRecords: Record<string, unknown>[]
}

/**
 * Exporte toutes les donnees personnelles d'un utilisateur au format JSON.
 * Couvre les Articles 15 (droit d'acces) et 20 (portabilite) du RGPD.
 *
 * `userId` is a UserAccount id. Member-bound data (publisher activities,
 * attributions, group membership) is read via the linked Member when present.
 */
export async function exportAccountData(db: TransactionClient, userId: number): Promise<UserDataExport> {
  const account = await db.userAccount.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstname: true,
      lastname: true,
      email: true,
      active: true,
      platformAdmin: true,
      anonymizedAt: true,
      memberId: true,
      member: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
          phone: true,
          address: true,
          isMale: true,
          birthDate: true,
          baptismDate: true,
          isPublisher: true,
          type: true,
          isHelder: true,
          isServant: true,
          isAnointed: true,
          publisherGroupId: true,
          leftAt: true,
          inactiveAt: true,
          anonymizedAt: true,
        },
      },
    },
  })

  if (!account) {
    throw new Error(`Utilisateur introuvable : ${userId}`)
  }

  const memberId = account.memberId

  const [permissions, events, documentsViewed, documentVersionUploads, consentRecords] = await Promise.all([
    db.congregationUserPermission.findMany({
      where: { userId },
      select: {
        permission: { select: { key: true } },
      },
    }),
    db.event.findMany({
      where: { createdById: userId },
      select: {
        name: true,
        description: true,
        startDate: true,
        endDate: true,
        kind: { select: { name: true, key: true } },
        createdAt: true,
      },
      orderBy: { startDate: 'desc' },
    }),
    db.boardDocument.findMany({
      where: { viewedBy: { some: { id: userId } } },
      select: {
        title: true,
        type: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.boardDocumentVersion.findMany({
      where: { uploadedById: userId },
      select: {
        documentId: true,
        versionNumber: true,
        createdAt: true,
        document: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.consentRecord.findMany({
      where: { userId },
      select: {
        purpose: true,
        consentedAt: true,
        withdrawnAt: true,
        consentVersion: true,
      },
      orderBy: { consentedAt: 'desc' },
    }),
  ])

  const [activities, attributions, group] = memberId
    ? await Promise.all([
        db.publisherActivity.findMany({
          where: { publisherId: memberId },
          select: {
            month: true,
            year: true,
            hours: true,
            studies: true,
            type: true,
            isPublisher: true,
            notes: true,
          },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        }),
        db.attribution.findMany({
          where: { publisherId: memberId },
          select: {
            territory: { select: { number: true, type: true } },
            type: true,
            startDate: true,
            endDate: true,
            lateDate: true,
            notes: true,
          },
          orderBy: { startDate: 'desc' },
        }),
        db.publisherGroup.findFirst({
          where: {
            OR: [{ members: { some: { id: memberId } } }, { responsibleId: memberId }, { deputyId: memberId }],
          },
          select: {
            name: true,
            adress: true,
            responsibleId: true,
            deputyId: true,
          },
        }),
      ])
    : [[], [], null]

  return {
    exportDate: new Date().toISOString(),
    exportVersion: '2.0',
    user: account,
    permissions: permissions.map(p => p.permission),
    publisherActivities: activities,
    attributions: attributions.map(a => ({
      territory: a.territory,
      type: a.type,
      startDate: a.startDate,
      endDate: a.endDate,
      lateDate: a.lateDate,
      notes: a.notes,
    })),
    publisherGroup: group,
    eventsCreated: events,
    boardDocumentsViewed: documentsViewed,
    boardDocumentVersionUploads: documentVersionUploads.map(v => ({
      documentTitle: v.document.title,
      versionNumber: v.versionNumber,
      createdAt: v.createdAt,
    })),
    consentRecords,
  }
}
