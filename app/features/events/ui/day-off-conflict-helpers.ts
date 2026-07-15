export interface ConflictTitleMessages {
  singular: () => string
  plural: (count: number) => string
}

export function pickConflictModalTitle(count: number, messages: ConflictTitleMessages): string {
  return count === 1 ? messages.singular() : messages.plural(count)
}
