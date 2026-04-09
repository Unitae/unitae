import type { StatsAttribution } from './stats-attribution.type'

const MS_PER_DAY = 24 * 60 * 60 * 1000

// Calcule le délai moyen (en jours) entre la fin d'une attribution et le début de la suivante pour le même territoire
export function computeAvailabilityGap(attributions: StatsAttribution[]): number {
  // Regrouper par territoire, triées par date de début (déjà triées par le fetch)
  const byTerritory = new Map<number, StatsAttribution[]>()
  for (const a of attributions) {
    const list = byTerritory.get(a.territoryId) ?? []
    list.push(a)
    byTerritory.set(a.territoryId, list)
  }

  const gaps: number[] = []

  for (const territoryAttributions of byTerritory.values()) {
    for (let i = 0; i < territoryAttributions.length - 1; i++) {
      const current = territoryAttributions[i]
      const next = territoryAttributions[i + 1]

      // On ne peut calculer un gap que si l'attribution courante a une date de fin
      if (current.endDate == null) continue

      const gapDays = (next.startDate.getTime() - current.endDate.getTime()) / MS_PER_DAY
      if (gapDays >= 0) {
        gaps.push(gapDays)
      }
    }
  }

  if (gaps.length === 0) return 0

  const sum = gaps.reduce((acc, g) => acc + g, 0)
  return Math.round(sum / gaps.length)
}
