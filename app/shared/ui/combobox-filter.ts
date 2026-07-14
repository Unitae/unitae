function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function filterSuggestions(query: string, suggestions: string[]): string[] {
  const trimmed = query.trim()
  if (!trimmed) return suggestions

  const normalizedQuery = normalize(trimmed)
  const caseInsensitiveQuery = trimmed.toLowerCase()

  return suggestions.filter(suggestion => {
    if (suggestion.toLowerCase() === caseInsensitiveQuery) return false
    return normalize(suggestion).includes(normalizedQuery)
  })
}
