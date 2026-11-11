const DIACRITICS = /\p{Diacritic}/gu
const NOT_KEY = /[^a-z0-9]+/g
const EDGES = /^-+|-+$/g

/**
 * A template's key, which the app uses to tell templates apart: made from its name (« Réunion du week-end » →
 * « reunion-du-week-end »), numbered when the congregation already has it. Nobody types it.
 */
export function templateKey(name: string, taken: readonly string[]): string {
  const base =
    name.normalize('NFD').replace(DIACRITICS, '').toLowerCase().replace(NOT_KEY, '-').replace(EDGES, '') || 'modele'
  const used = new Set(taken)
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}
