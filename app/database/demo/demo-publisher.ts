/**
 * The publishers a visitor could try the demo as, best first: plain publishers or pioneers holding no role in the
 * congregation (the publisher's pages then show a publisher's, nothing more), one with a territory in hand first,
 * then the most coming assignments. Ties go to the lowest key, so a seed always picks the same person.
 */
export function rankDemoPublishers(
  keys: number[],
  facts: { roles: Set<number>; holding: Set<number>; coming: Map<number, number> },
): number[] {
  const score = (key: number) => (facts.holding.has(key) ? 1000 : 0) + (facts.coming.get(key) ?? 0)
  return keys.filter(key => !facts.roles.has(key)).sort((a, b) => score(b) - score(a) || a - b)
}

const DAY = 24 * 60 * 60 * 1000

/**
 * The student part the demo's publisher takes, so her home page lists a coming assignment: the first one on a day
 * she isn't away, in a published programme if one fits (that's what a publisher reads), else in a draft. `parts` are
 * the coming demonstrations whose student she could replace.
 */
export function pickStudentPart(
  parts: { id: number; startDate: Date; published: boolean }[],
  absences: { startDate: Date; endDate: Date }[],
): number | null {
  const free = parts
    // An absence's end is the start of its last day: the whole day counts.
    .filter(
      part =>
        !absences.some(
          away => part.startDate >= away.startDate && part.startDate.getTime() < away.endDate.getTime() + DAY,
        ),
    )
    .sort((a, b) => Number(b.published) - Number(a.published) || a.startDate.getTime() - b.startDate.getTime())
  return free[0]?.id ?? null
}
