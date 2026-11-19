import { EventTemplateKey } from '~/features/events'

const DIACRITICS = /\p{Diacritic}/gu
const NOT_KEY = /[^a-z0-9]+/g
const EDGES = /^-+|-+$/g

// A built-in key means something to the app — a system template, a meeting the recurring job creates, the day-off key a
// restore reads as absences — whether or not the congregation has that template. A template that took the day-off key
// would be dropped on a restore, and its meetings come back as absences (importEventTemplates, importEvents).
const BUILT_IN_KEYS: readonly string[] = Object.values(EventTemplateKey)

/**
 * A template's key, which the app uses to tell templates apart: made from its name (« Réunion du week-end » →
 * « reunion-du-week-end »), numbered when the congregation already has it or it is a built-in one. Nobody types it.
 */
export function templateKey(name: string, taken: readonly string[]): string {
  const base =
    name.normalize('NFD').replace(DIACRITICS, '').toLowerCase().replace(NOT_KEY, '-').replace(EDGES, '') || 'modele'
  const used = new Set([...taken, ...BUILT_IN_KEYS])
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}
