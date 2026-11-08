interface NumberedTerritory {
  id: number
  number: string
}

/** The territories these entrances belong to, each once, in number order (2 before 10). */
export function uniqueTerritories<T extends NumberedTerritory>(entrances: { territories: T[] }[]): T[] {
  const byId = new Map(entrances.flatMap(entrance => entrance.territories).map(territory => [territory.id, territory]))
  return [...byId.values()].sort((a, b) => a.number.localeCompare(b.number, 'fr', { numeric: true }))
}
