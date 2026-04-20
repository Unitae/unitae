import { type AvailableDynamicType, DynamicType } from '~/features/display-board/model/dynamic-document.type'
import type { TransactionClient } from '~/shared/infra/db.server'

const PIONEER_TYPES = ['PionnierPermanant', 'PionnierSpecial', 'Missionnaire']

export type { AvailableDynamicType }

/**
 * Calcule le début du mois courant pour filtrer les évènements programme.
 */
function startOfCurrentMonth(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

/**
 * Retourne les types de documents dynamiques disponibles pour la congrégation,
 * en fonction des données présentes. Utilisé par le catalogue d'ajout.
 */
export async function listAvailableDynamicTypes(
  db: TransactionClient,
  congregationId: number,
): Promise<AvailableDynamicType[]> {
  const existing = await db.boardDynamicDocumentSettings.findMany({
    where: { congregationId },
    select: { dynamicType: true, dynamicRef: true },
  })
  const existingKeys = new Set(existing.map(e => `${e.dynamicType}|${e.dynamicRef ?? ''}`))

  const isAlreadyAdded = (type: DynamicType, ref: string | null) => existingKeys.has(`${type}|${ref ?? ''}`)

  const available: AvailableDynamicType[] = []

  const groupCount = await db.publisherGroup.count({ where: { congregationId } })
  if (groupCount > 0) {
    available.push({
      dynamicType: DynamicType.PublisherGroups,
      dynamicRef: null,
      defaultTitle: 'Groupes de prédication',
      alreadyAdded: isAlreadyAdded(DynamicType.PublisherGroups, null),
    })
  }

  const pioneerCount = await db.user.count({
    where: { congregationId, type: { in: PIONEER_TYPES }, active: true },
  })
  if (pioneerCount > 0) {
    available.push({
      dynamicType: DynamicType.Pioneers,
      dynamicRef: null,
      defaultTitle: 'Pionniers',
      alreadyAdded: isAlreadyAdded(DynamicType.Pioneers, null),
    })
  }

  const templates = await db.programmeTemplate.findMany({
    where: { congregationId },
    select: { key: true, name: true },
    orderBy: { name: 'asc' },
  })

  for (const template of templates) {
    available.push({
      dynamicType: DynamicType.Programme,
      dynamicRef: template.key,
      defaultTitle: template.name,
      alreadyAdded: isAlreadyAdded(DynamicType.Programme, template.key),
    })
  }

  return available
}

/**
 * Récupère la date de dernière modification des données sous-jacentes
 * pour un document dynamique. Utilisé pour détecter si le contenu a changé
 * depuis la dernière consultation par l'utilisateur.
 */
export async function getContentVersion(
  db: TransactionClient,
  dynamicType: string,
  dynamicRef: string | null,
  congregationId: number,
): Promise<Date | null> {
  if (dynamicType === DynamicType.PublisherGroups) {
    const [group, memberUser] = await Promise.all([
      db.publisherGroup.findFirst({
        where: { congregationId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      db.user.findFirst({
        where: { congregationId, publisherGroupId: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ])

    return maxDate(group?.updatedAt, memberUser?.updatedAt)
  }

  if (dynamicType === DynamicType.Pioneers) {
    const pioneer = await db.user.findFirst({
      where: { congregationId, type: { in: PIONEER_TYPES } },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    })
    return pioneer?.updatedAt ?? null
  }

  if (dynamicType === DynamicType.Programme && dynamicRef) {
    const fromDate = startOfCurrentMonth()

    const [event, assignment] = await Promise.all([
      db.event.findFirst({
        where: {
          congregationId,
          template: { key: dynamicRef },
          startDate: { gte: fromDate },
        },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      db.programmePartAssignment.findFirst({
        where: {
          congregationId,
          event: {
            template: { key: dynamicRef },
            startDate: { gte: fromDate },
          },
        },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ])

    return maxDate(event?.updatedAt, assignment?.updatedAt)
  }

  return null
}

function maxDate(...dates: (Date | null | undefined)[]): Date | null {
  const valid = dates.filter((d): d is Date => d instanceof Date)
  if (valid.length === 0) return null
  return valid.reduce((max, d) => (d.getTime() > max.getTime() ? d : max))
}

/**
 * Marque un document dynamique comme vu par l'utilisateur en mettant à jour
 * le timestamp `viewedAt`. Réinitialise ainsi l'indicateur non-lu pour cet utilisateur.
 */
export async function markDynamicDocumentViewed(
  db: TransactionClient,
  settingsId: number,
  userId: number,
): Promise<void> {
  await db.boardDynamicDocumentView.upsert({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      settingsId_userId: { settingsId, userId },
    },
    create: { settingsId, userId, viewedAt: new Date() },
    update: { viewedAt: new Date() },
  })
}

/**
 * Récupère les données live pour un document dynamique.
 * Le routeur du viewer appelle cette fonction puis délègue le rendu au composant approprié.
 */
export async function getDynamicDocumentData(
  db: TransactionClient,
  dynamicType: string,
  dynamicRef: string | null,
  congregationId: number,
  options: { showServices?: boolean } = {},
) {
  if (dynamicType === DynamicType.PublisherGroups) {
    return {
      type: DynamicType.PublisherGroups,
      groups: await fetchPublisherGroups(db, congregationId),
    } as const
  }

  if (dynamicType === DynamicType.Pioneers) {
    return {
      type: DynamicType.Pioneers,
      pioneers: await fetchPioneers(db, congregationId),
    } as const
  }

  if (dynamicType === DynamicType.Programme && dynamicRef) {
    return {
      type: DynamicType.Programme,
      events: await fetchProgramme(db, congregationId, dynamicRef, options.showServices ?? false),
      templateKey: dynamicRef,
      showServices: options.showServices ?? false,
    } as const
  }

  return null
}

function fetchPublisherGroups(db: TransactionClient, congregationId: number) {
  return db.publisherGroup.findMany({
    where: { congregationId },
    include: {
      responsible: { select: { id: true, firstname: true, lastname: true, anonymizedAt: true } },
      deputy: { select: { id: true, firstname: true, lastname: true, anonymizedAt: true } },
      members: {
        where: { active: true, isPublisher: true },
        select: { id: true, firstname: true, lastname: true, anonymizedAt: true, type: true },
        orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
      },
    },
    orderBy: { name: 'asc' },
  })
}

function fetchPioneers(db: TransactionClient, congregationId: number) {
  return db.user.findMany({
    where: { congregationId, type: { in: PIONEER_TYPES }, active: true },
    select: { id: true, firstname: true, lastname: true, type: true, anonymizedAt: true },
    orderBy: [{ type: 'asc' }, { lastname: 'asc' }, { firstname: 'asc' }],
  })
}

function fetchProgramme(db: TransactionClient, congregationId: number, templateKey: string, showServices: boolean) {
  const fromDate = startOfCurrentMonth()

  return db.event.findMany({
    where: {
      congregationId,
      template: { key: templateKey },
      startDate: { gte: fromDate },
    },
    include: {
      partAssignments: {
        orderBy: { order: 'asc' },
        include: {
          assignee: { select: { id: true, firstname: true, lastname: true, anonymizedAt: true } },
          assistant: { select: { id: true, firstname: true, lastname: true, anonymizedAt: true } },
        },
      },
      serviceRoleAssignments: showServices
        ? {
            include: {
              assignee: { select: { id: true, firstname: true, lastname: true, anonymizedAt: true } },
            },
          }
        : false,
    },
    orderBy: { startDate: 'asc' },
  })
}
