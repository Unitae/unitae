/**
 * Regroupe les parties d'un programme en "créneaux" :
 * - D'abord en blocs consécutifs partageant la même `section` (pour préserver
 *   l'ordre chronologique lorsqu'une section revient plusieurs fois).
 * - Puis à l'intérieur de chaque bloc, les parties qui partagent la même valeur
 *   `order` sont regroupées dans un même "slot" (elles se déroulent en parallèle
 *   dans des pistes/salles différentes).
 *
 * Un slot contenant une seule partie se rend comme aujourd'hui ; un slot avec
 * plusieurs parties se rend côte à côte avec le `track` en étiquette.
 */

export interface PartLike {
  id: number
  section: string
  order: number
  track: string
}

export interface PartSlot<T> {
  /** Valeur de `order` partagée par toutes les parties du slot */
  order: number
  /** Parties qui s'exécutent en parallèle sur ce slot */
  parts: T[]
}

export interface SectionGroup<T> {
  section: string
  slots: PartSlot<T>[]
}

export function groupPartsBySlot<T extends PartLike>(parts: T[]): SectionGroup<T>[] {
  const sorted = [...parts].sort((a, b) => a.order - b.order)

  const sectionGroups: SectionGroup<T>[] = []
  for (const part of sorted) {
    const section = part.section || ''
    const lastGroup = sectionGroups[sectionGroups.length - 1]

    if (lastGroup && lastGroup.section === section) {
      const lastSlot = lastGroup.slots[lastGroup.slots.length - 1]
      if (lastSlot && lastSlot.order === part.order) {
        lastSlot.parts.push(part)
      } else {
        lastGroup.slots.push({ order: part.order, parts: [part] })
      }
    } else {
      sectionGroups.push({
        section,
        slots: [{ order: part.order, parts: [part] }],
      })
    }
  }

  return sectionGroups
}
