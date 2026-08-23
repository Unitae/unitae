export interface ProgrammePartLike {
  section: string
  track: string
  trackOrder: number | null
  durationMin?: number | null
}

/** Output-only shape of {@link groupProgrammeParts} — do not hand-construct. */
export interface ProgrammeTrackGroup<T> {
  track: string
  parts: T[]
}

/** Output-only shape of {@link groupProgrammeParts} — do not hand-construct. */
export interface ProgrammeSectionGroup<T> {
  section: string
  tracks: ProgrammeTrackGroup<T>[]
}

/**
 * Shared grouping for every surface that renders a programme's parts (event
 * view/editor, template view/editor, mobile list).
 *
 * Sections follow the programme's chronological order: a new group starts
 * whenever the section changes. Tracks are *parallel schedules* inside a
 * section (rooms, groups), so within a section they cluster by value no
 * matter where their parts sit in the linear order — a part appended later
 * to "Salle A" joins its room instead of fragmenting it into a duplicate
 * sub-header. The untracked cluster (the section's common schedule) always
 * leads; named tracks then sort by trackOrder (nulls last), then by first
 * appearance; parts keep their incoming order inside a cluster.
 */
export function groupProgrammeParts<T extends ProgrammePartLike>(parts: T[]): ProgrammeSectionGroup<T>[] {
  const groups: Array<{
    section: string
    trackMap: Map<string, { parts: T[]; minTrackOrder: number; firstIndex: number }>
  }> = []

  let current: (typeof groups)[number] | null = null
  parts.forEach((partItem, index) => {
    const section = partItem.section || ''
    if (current == null || current.section !== section) {
      current = { section, trackMap: new Map() }
      groups.push(current)
    }
    const track = partItem.track || ''
    let cluster = current.trackMap.get(track)
    if (cluster == null) {
      cluster = { parts: [], minTrackOrder: Number.POSITIVE_INFINITY, firstIndex: index }
      current.trackMap.set(track, cluster)
    }
    cluster.parts.push(partItem)
    if (partItem.trackOrder != null) {
      cluster.minTrackOrder = Math.min(cluster.minTrackOrder, partItem.trackOrder)
    }
  })

  return groups.map(group => ({
    section: group.section,
    tracks: [...group.trackMap.entries()]
      .sort(([trackA, a], [trackB, b]) => {
        const keyA = trackA === '' ? Number.NEGATIVE_INFINITY : a.minTrackOrder
        const keyB = trackB === '' ? Number.NEGATIVE_INFINITY : b.minTrackOrder
        return keyA - keyB || a.firstIndex - b.firstIndex
      })
      .map(([track, cluster]) => ({ track, parts: cluster.parts })),
  }))
}

/** Total planned minutes of a section, across all of its tracks; null when no part carries a duration. */
export function sectionDurationMin<T extends ProgrammePartLike>(group: ProgrammeSectionGroup<T>): number | null {
  let total: number | null = null
  for (const track of group.tracks) {
    for (const partItem of track.parts) {
      if (partItem.durationMin != null) total = (total ?? 0) + partItem.durationMin
    }
  }
  return total
}
