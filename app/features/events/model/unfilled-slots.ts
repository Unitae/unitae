/** What a part needs to say whether its slots are held: its speaker, an external one, and its reader's. */
interface PartSlots {
  assigneeId: number | null
  externalSpeakerId: number | null
  assistantId: number | null
  preset: { hasReaderSlot: boolean } | null
}

/**
 * The slots nobody holds yet, by kind of schedule: a part without its speaker (a brother or an external speaker), a
 * reader its preset asks for, a service without its person. Publishing with some is allowed after a warning: a preset
 * asks only for the people a part needs, so an empty slot is not normal (the user's rule).
 */
export function unfilledSlots({ parts, services }: { parts: PartSlots[]; services: { assigneeId: number | null }[] }): {
  programme: number
  duty: number
} {
  const programme = parts.reduce(
    (count, part) =>
      count +
      (part.assigneeId == null && part.externalSpeakerId == null ? 1 : 0) +
      (part.preset?.hasReaderSlot === true && part.assistantId == null ? 1 : 0),
    0,
  )
  return { programme, duty: services.filter(service => service.assigneeId == null).length }
}
