import type { Prisma } from '~/database/generated/client'
import { isDynamicType } from '~/features/display-board/model/dynamic-document.type'
import { type AppearanceInput, appearanceFor } from '~/features/display-board/schemas/appearance.schema'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Saves a dynamic document's settings from its edit page: where and when it shows, the programme's
 * template choices, and how it looks. The appearance is stored for the document's own type, so a
 * layout another type offers can never reach it. Null when the congregation has no such document.
 */
export async function updateDynamicDocument(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  data: {
    title: string
    sectionId: number
    visibleFrom: Date | null
    visibleUntil: Date | null
    isHighlighted: boolean
    showServices: boolean
    dynamicConfig?: Prisma.InputJsonValue
    appearance?: AppearanceInput
  },
) {
  const existing = await db.boardDynamicDocumentSettings.findFirst({
    where: { id, congregationId },
    select: { dynamicType: true },
  })
  if (!existing) return null

  const { appearance, ...settings } = data
  const updated = await db.boardDynamicDocumentSettings.update({
    where: { id_congregationId: { id, congregationId } },
    data: {
      ...settings,
      ...(appearance && isDynamicType(existing.dynamicType)
        ? { appearance: { ...appearanceFor(existing.dynamicType, appearance) } }
        : {}),
    },
  })

  audit({
    action: AuditAction.BoardDynamicDocumentUpdated,
    congregationId,
    actorId,
    entityType: 'BoardDynamicDocumentSettings',
    entityId: id,
  })

  return updated
}
