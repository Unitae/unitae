import { describe, expect, it } from 'vitest'
import * as m from '~/i18n/paraglide/messages'
import { BuildingSyncError } from './building-sync.type'
import { buildingSyncErrorLabel } from './building-sync-error-label'

describe('buildingSyncErrorLabel', () => {
  it('words every failure code', () => {
    for (const code of Object.values(BuildingSyncError)) {
      expect(buildingSyncErrorLabel(code), code).not.toBe('')
    }
    expect(buildingSyncErrorLabel(BuildingSyncError.SourceTooLarge)).toBe(m.building_sync_error_source_too_large())
  })

  it('reads a missing or unknown code as unexpected', () => {
    expect(buildingSyncErrorLabel(undefined)).toBe(m.building_sync_error_unknown())
    expect(buildingSyncErrorLabel('something-else')).toBe(m.building_sync_error_unknown())
  })
})
