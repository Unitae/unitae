import { parseProgrammeConfig } from '~/features/display-board/model/dynamic-document.type'
import { startOfCurrentMonth } from '~/features/display-board/server/dynamic-documents.server'
import { EventStatus } from '~/features/events'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'

const logger = createLogger('event-link')

/**
 * The event as a document would see it, or null if none could show it.
 *
 * Matching the template is not the same as holding the event: a document
 * renders released events from the start of the current month onwards, so a
 * draft — or one that has aged out — would leave the reader on a programme
 * their assignment is not in, with nothing on the page to say why.
 */
async function readRenderableEvent(
  db: TransactionClient,
  event: { id: number; templateId: number | null },
  congregationId: number,
) {
  const row = await db.event.findFirst({
    where: { id: event.id, congregationId },
    select: { status: true, startDate: true, template: { select: { key: true } } },
  })
  if (!row) {
    // The caller just persisted a write referencing this event, so its
    // disappearing here is a real race worth surfacing rather than masking.
    logger.warn('programme link fell back to /board: event missing at resolve time', {
      eventId: event.id,
      templateId: event.templateId,
      congregationId,
    })
    return null
  }
  if (row.status !== EventStatus.Released) return null
  if (row.startDate < startOfCurrentMonth()) return null
  return row
}

// Resolves the best-effort public URL where an assignee can view their upcoming
// event. Preferred target is a Programme dynamic document on the board that
// covers this event's template — publishers already have `BoardViewer` so the
// link lands them on the read-only viewer, not the elders-only /programs/*
// editing surface. If no such document exists, falls back to /board so the
// button still points somewhere meaningful.
//
// The returned URL is embedded in the notification payload at notify() time,
// so it reflects the state of the board at the moment the notification fires
// (not at delivery). If an admin later removes the tile, existing pending
// notifications retain the resolved-at-notify-time URL — worst case the
// viewer route redirects back to /board.
export async function resolveProgrammeLink(
  db: TransactionClient,
  event: { id: number; templateId: number | null },
  congregationId: number,
): Promise<string> {
  if (event.templateId == null) return '/board'

  const eventRow = await readRenderableEvent(db, event, congregationId)
  if (!eventRow) return '/board'

  const candidates = await db.boardDynamicDocumentSettings.findMany({
    where: { congregationId, dynamicType: 'programme' },
    orderBy: { id: 'asc' },
    select: { id: true, dynamicRef: true, dynamicConfig: true },
  })
  if (candidates.length === 0) return '/board'

  // Pre-parse each candidate's config once so the legacy-fallback pass below
  // reuses the result without re-parsing (also avoids the double-parse in the
  // "corrupt JSON vs. no config" check).
  const parsed = candidates.map(c => ({
    candidate: c,
    config: c.dynamicConfig == null ? null : parseProgrammeConfig(c.dynamicConfig),
    hasConfigField: c.dynamicConfig != null,
  }))

  const matches: { id: number; breadth: number }[] = []
  for (const { candidate, config, hasConfigField } of parsed) {
    // A non-null `dynamicConfig` that fails to parse is a data-integrity issue,
    // not a legit legacy row. Log so operators can spot it — the row would
    // otherwise silently keep falling through to /board forever.
    if (hasConfigField && config == null) {
      logger.warn('programme dynamic doc has malformed dynamicConfig, skipping', {
        candidateId: candidate.id,
        congregationId,
      })
      continue
    }
    if (config?.templates.some(t => t.templateId === event.templateId)) {
      matches.push({ id: candidate.id, breadth: config.templates.length })
    }
  }

  // Several documents can hold the same event and nothing in the model says
  // which one it belongs to. The narrowest is the likelier destination — a
  // document built for this one programme beats a catch-all — and id breaks
  // the remaining tie so the same event always resolves the same way. Giving a
  // document a scope of its own is what would answer this properly.
  if (matches.length > 0) {
    const best = matches.sort((a, b) => a.breadth - b.breadth || a.id - b.id)[0]
    return `/board/dynamic/${best?.id}/viewer?eventId=${event.id}`
  }

  // No multi-template match — fall back to legacy `dynamicRef` (template key).
  // Only the rows that never carried a config field are eligible; malformed-
  // config rows are treated as broken and don't earn a legacy retry.
  const legacyCandidates = parsed.filter(p => !p.hasConfigField && p.candidate.dynamicRef != null)
  if (legacyCandidates.length === 0) return '/board'

  const templateKey = eventRow.template?.key
  if (!templateKey) return '/board'

  for (const { candidate } of legacyCandidates) {
    if (candidate.dynamicRef === templateKey) {
      return `/board/dynamic/${candidate.id}/viewer?eventId=${event.id}`
    }
  }

  return '/board'
}
