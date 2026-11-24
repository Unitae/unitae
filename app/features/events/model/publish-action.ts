/**
 * Whether the meeting's header has a publishing control to draw, as EventPublishAction decides it: « Créer le
 * programme » while the meeting awaits its programme, « Tout publier » while a draft is the reader's, otherwise
 * publishing or withdrawing a meeting without schedules. The title row shows only when something is in it.
 */
export function publishActionShown(state: {
  awaitingProgramme: boolean
  canCreateProgramme: boolean
  publishAll: { count: number } | null
  canRelease: boolean
  canUnrelease: boolean
}): boolean {
  if (state.awaitingProgramme) return state.canCreateProgramme
  if (state.publishAll != null) return state.publishAll.count > 0
  return state.canRelease || state.canUnrelease
}
