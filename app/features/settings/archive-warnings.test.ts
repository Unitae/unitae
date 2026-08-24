import { describe, expect, it } from 'vitest'
import { legacyPresetWarnings } from './archive-warnings'

const ELIGIBILITY_RE = /éligibilité/i
const MERGED_KIND_RE = /Sujet VCM/i

describe('legacyPresetWarnings', () => {
  it('warns that a v2.5 archive loses its preset-level eligibility', () => {
    const warnings = legacyPresetWarnings('2.5')

    expect(warnings.some(w => ELIGIBILITY_RE.test(w))).toBe(true)
  })

  it('warns that the three midweek kinds are merged and their wording dropped', () => {
    const warnings = legacyPresetWarnings('2.5')

    expect(warnings.some(w => MERGED_KIND_RE.test(w))).toBe(true)
  })

  it('says nothing for a current archive', () => {
    // 2.6 already stores the merged kinds and no preset eligibility, so there
    // is nothing to lose and nothing to tell the user about.
    expect(legacyPresetWarnings('2.6')).toEqual([])
  })

  it('says nothing for archives predating part presets', () => {
    // Presets arrived in 2.5. An older archive carries no preset rows at all,
    // so warning about discarded preset data would be false alarm.
    for (const version of ['1.0', '1.1', '2.0', '2.4']) {
      expect(legacyPresetWarnings(version)).toEqual([])
    }
  })
})
