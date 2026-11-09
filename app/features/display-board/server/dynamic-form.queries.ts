import type { Prisma } from '~/database/generated/client'
import { DynamicType, isDynamicType } from '~/features/display-board/model/dynamic-document.type'
import { parseAppearance } from '~/features/display-board/schemas/appearance.schema'
import { countHighlighted, listSectionChoices } from '~/features/display-board/server/document-form.queries'
import {
  getDynamicDocumentData,
  listAvailableDynamicTypes,
} from '~/features/display-board/server/dynamic-documents.server'
import { getTemplates } from '~/features/events/index.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/** An existing document by its id, or a new one of a type, under the title its form starts from. */
export type DynamicFormTarget = { id: number } | { type: string; ref: string | null; title: string }

/** A new programme lists every template, with its parts and its services, grouped by date. */
function defaultProgrammeConfig(templates: { id: number }[]): Prisma.JsonValue {
  return { templates: templates.map(t => ({ templateId: t.id, parts: true, services: true })), groupBy: 'date' }
}

/**
 * What a dynamic document's form shows: the document, or the defaults of a new one; its appearance; the
 * sections and, for a programme, the templates to choose from; how many others are « à la une »; and its
 * data today, for the preview. Null for a document that is not this congregation's, or an unknown type.
 */
export async function loadDynamicForm(
  db: TransactionClient,
  { congregationId, now, document: target }: { congregationId: number; now: Date; document: DynamicFormTarget },
) {
  const existing =
    'id' in target
      ? await db.boardDynamicDocumentSettings.findFirst({ where: { id: target.id, congregationId } })
      : null
  if ('id' in target && existing == null) return null
  const type = existing?.dynamicType ?? ('type' in target ? target.type : '')
  if (!isDynamicType(type)) return null

  const [sections, templates, highlightedOthers] = await Promise.all([
    listSectionChoices(db, congregationId),
    type === DynamicType.Programme ? getTemplates(db, congregationId) : [],
    countHighlighted(db, congregationId, existing ? { kind: 'dynamic', id: existing.id } : undefined),
  ])
  const document = existing
    ? {
        id: existing.id as number | null,
        type,
        ref: existing.dynamicRef,
        title: existing.title,
        sectionId: existing.sectionId,
        visibleFrom: existing.visibleFrom,
        visibleUntil: existing.visibleUntil,
        isHighlighted: existing.isHighlighted,
        showServices: existing.showServices,
        dynamicConfig: existing.dynamicConfig,
      }
    : {
        id: null,
        type,
        ref: 'ref' in target ? target.ref : null,
        title: 'title' in target ? target.title : '',
        sectionId: sections[0]?.id ?? 0,
        visibleFrom: now as Date | null,
        visibleUntil: null as Date | null,
        isHighlighted: false,
        showServices: false,
        dynamicConfig: type === DynamicType.Programme ? defaultProgrammeConfig(templates) : null,
      }
  const data = await getDynamicDocumentData(db, type, document.ref, congregationId, {
    showServices: document.showServices,
    dynamicConfig: document.dynamicConfig,
  })

  return {
    document,
    appearance: parseAppearance(type, existing?.appearance ?? null),
    sections,
    templates,
    highlightedOthers,
    data,
  }
}

/**
 * The types a new dynamic document can show here, whether the board has a section to put it in, and
 * the documents already added, by `type|ref`, so one shown once leads to it rather than to a second.
 */
export async function listDynamicChoices(db: TransactionClient, congregationId: number) {
  const [available, sections, documents] = await Promise.all([
    listAvailableDynamicTypes(db, congregationId),
    db.boardSection.count({ where: { congregationId } }),
    db.boardDynamicDocumentSettings.findMany({
      where: { congregationId },
      orderBy: { id: 'asc' },
      select: { id: true, dynamicType: true, dynamicRef: true },
    }),
  ])
  const existing: Record<string, number> = {}
  for (const doc of documents) existing[`${doc.dynamicType}|${doc.dynamicRef ?? ''}`] ??= doc.id
  return { available, hasSection: sections > 0, existing }
}
