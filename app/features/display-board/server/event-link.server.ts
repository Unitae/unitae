import { parseProgrammeConfig } from '~/features/display-board/model/dynamic-document.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'

const logger = createLogger('event-link')

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
      return `/board/dynamic/${candidate.id}/viewer?eventId=${event.id}`
    }
  }

  // No multi-template match — fall back to legacy `dynamicRef` (template key).
  // Only the rows that never carried a config field are eligible; malformed-
  // config rows are treated as broken and don't earn a legacy retry.
  const legacyCandidates = parsed.filter(p => !p.hasConfigField && p.candidate.dynamicRef != null)
  if (legacyCandidates.length === 0) return '/board'

  const eventRow = await db.event.findFirst({
    where: { id: event.id, congregationId },
    select: { template: { select: { key: true } } },
  })
  const templateKey = eventRow?.template?.key
  if (!templateKey) {
    // Reaching this branch means the caller had `event.templateId` set but
    // the event or its template row disappeared before we could resolve the
    // key. Since the caller just persisted a write referencing this event,
    // this is a real data-race worth surfacing rather than silently masking.
    logger.warn('programme link fell back to /board: event or template missing at resolve time', {
      eventId: event.id,
      templateId: event.templateId,
      congregationId,
    })
    return '/board'
  }

  for (const { candidate } of legacyCandidates) {
    if (candidate.dynamicRef === templateKey) {
      return `/board/dynamic/${candidate.id}/viewer?eventId=${event.id}`
    }
  }

  return '/board'
}
