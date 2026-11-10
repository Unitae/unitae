import * as m from '~/i18n/paraglide/messages'
import { BuildingSyncError } from './building-sync.type'

const LABELS: Record<BuildingSyncError, () => string> = {
  [BuildingSyncError.SourceUnreachable]: m.building_sync_error_source_unreachable,
  [BuildingSyncError.SourceRefused]: m.building_sync_error_source_refused,
  [BuildingSyncError.SourceTooLarge]: m.building_sync_error_source_too_large,
  [BuildingSyncError.SourceUnreadable]: m.building_sync_error_source_unreadable,
  [BuildingSyncError.NoMatchingAddress]: m.building_sync_error_no_matching_address,
  [BuildingSyncError.Interrupted]: m.building_sync_error_interrupted,
  [BuildingSyncError.Unknown]: m.building_sync_error_unknown,
}

/** Why a sync failed, in the reader's language. An unknown or missing code reads as unexpected. */
export function buildingSyncErrorLabel(reason: string | null | undefined): string {
  const label = reason != null && reason in LABELS ? LABELS[reason as BuildingSyncError] : LABELS.Unknown
  return label()
}
