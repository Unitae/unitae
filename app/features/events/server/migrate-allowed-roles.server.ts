import { type PartRoleKind, setPartPresetAllowedRoles } from '~/features/events/server/allowed-roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'

const SLOTS: PartRoleKind[] = ['speaker', 'reader']

export interface AllowedRolesMigrationResult {
  /** Preset/slot pairs whose roles were consolidated onto the kind. */
  migrated: number
  /**
   * Pairs left alone because the parts using the kind did not agree. Reported
   * rather than resolved: a union would widen eligibility for the stricter
   * part and an intersection would narrow it for the looser one, and both
   * change who may be assigned without anyone asking.
   */
  conflicts: { preset: string; asKind: PartRoleKind }[]
}

function sortedKey(roleIds: number[]): string {
  return [...roleIds].sort((a, b) => a - b).join(',')
}

/**
 * Lifts per-part allowed roles onto the preset, where doing so is unambiguous.
 *
 * Safe to skip entirely: eligibility falls back to the part's own rows when a
 * kind has none, so parts keep working untouched. This only consolidates, and
 * only where every part using a kind already agrees.
 *
 * A kind that already has roles for a slot is left alone, so re-running cannot
 * overwrite a decision someone made by hand.
 */
export async function migrateAllowedRolesToPresets(
  db: TransactionClient,
  congregationId: number,
): Promise<AllowedRolesMigrationResult> {
  const presets = await db.partPreset.findMany({
    where: { congregationId },
    select: { id: true, name: true },
  })
  const result: AllowedRolesMigrationResult = { migrated: 0, conflicts: [] }

  for (const preset of presets) {
    const parts = await db.templatePart.findMany({
      where: { congregationId, presetId: preset.id },
      select: { id: true, allowedRoles: { select: { roleId: true, asKind: true } } },
    })
    if (parts.length === 0) continue

    const existing = await db.partPresetAllowedRole.findMany({
      where: { presetId: preset.id, congregationId },
      select: { asKind: true },
    })
    const alreadySet = new Set(existing.map(row => row.asKind))

    for (const asKind of SLOTS) {
      if (alreadySet.has(asKind)) continue

      const perPart = parts.map(part =>
        sortedKey(part.allowedRoles.filter(role => role.asKind === asKind).map(role => role.roleId)),
      )
      // Nothing to lift: no part restricts this slot.
      if (perPart.every(key => key === '')) continue

      const agreed = new Set(perPart).size === 1
      if (!agreed) {
        result.conflicts.push({ preset: preset.name, asKind })
        continue
      }

      const roleIds = perPart[0].split(',').map(Number)
      await setPartPresetAllowedRoles(db, preset.id, asKind, roleIds, congregationId)
      result.migrated += 1
    }
  }

  return result
}
