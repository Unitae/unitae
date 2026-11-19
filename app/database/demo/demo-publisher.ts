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
