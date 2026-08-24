// The only archive version that stored eligibility on the part kinds, and the
// three seeded kinds it stored under. v2.6 folded them into 'midweek-talk' and
// moved eligibility onto the parts — see the 20260824 migration. Anything older
// than 2.5 has no PartPreset rows at all, so it has nothing to lose here.
const LOSSY_PRESET_ARCHIVE_VERSION = '2.5'

/**
 * What restoring an older archive will quietly drop.
 *
 * Surfaced through validateImport, which runs before the user confirms, so the
 * loss is something they accept rather than discover months later when an
 * assignment picker offers the wrong people. A log line would not have done
 * that — the person restoring the archive does not read the server log.
 */
export function legacyPresetWarnings(version: string): string[] {
  if (version !== LOSSY_PRESET_ARCHIVE_VERSION) return []

  return [
    "Cette archive place l'éligibilité (qui peut assurer un rôle) sur le type de partie. " +
      "Ce réglage n'existe plus et ne sera pas importé : l'éligibilité définie sur chaque partie, elle, est conservée.",
    'Les types « Joyaux spirituels », « Perles spirituelles » et « Discours VCM » sont fusionnés en un seul type ' +
      '« Sujet VCM ». Les parties concernées restent liées, mais un nom ou un message personnalisé enregistré sur ' +
      'ces trois types sera perdu au profit des textes par défaut.',
  ]
}
