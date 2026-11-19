/**
 * The publishers a visitor could try the demo as, best first: a member of the « Prospection » team (the publisher's
 * prospection pages then have something on them), then one with a territory in hand, then the most coming
 * assignments. Ties go to the lowest key, so a seed always picks the same person.
 */
export function rankDemoPublishers(
  keys: number[],
  facts: { prospection: Set<number>; holding: Set<number>; coming: Map<number, number> },
): number[] {
  const score = (key: number) =>
    (facts.prospection.has(key) ? 100_000 : 0) + (facts.holding.has(key) ? 1000 : 0) + (facts.coming.get(key) ?? 0)
  return [...keys].sort((a, b) => score(b) - score(a) || a - b)
}
