import { parseProgrammeConfig } from '~/features/display-board/model/dynamic-document.type'
import type { TransactionClient } from '~/shared/infra/db.server'

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

  for (const candidate of candidates) {
    // Multi-template mode: parse the JSON config and look for our templateId.
    const config = parseProgrammeConfig(candidate.dynamicConfig)
    if (config?.templates.some(t => t.templateId === event.templateId)) {
      return `/board/dynamic/${candidate.id}/viewer?eventId=${event.id}`
    }
  }

  // No multi-template match — fall back to legacy `dynamicRef` (template key).
  // We only fetch the event's template key when at least one legacy candidate
  // needs comparing, avoiding an unnecessary round-trip in the common case.
  const legacyCandidates = candidates.filter(c => c.dynamicRef != null && parseProgrammeConfig(c.dynamicConfig) == null)
  if (legacyCandidates.length === 0) return '/board'

  const eventRow = await db.event.findFirst({
    where: { id: event.id, congregationId },
    select: { template: { select: { key: true } } },
  })
  const templateKey = eventRow?.template?.key
  if (!templateKey) return '/board'

  for (const candidate of legacyCandidates) {
    if (candidate.dynamicRef === templateKey) {
      return `/board/dynamic/${candidate.id}/viewer?eventId=${event.id}`
    }
  }

  return '/board'
}
