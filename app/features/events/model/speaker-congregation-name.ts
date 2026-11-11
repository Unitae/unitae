import { stripDiacritics } from '~/shared/utils/strip-diacritics'

const TYPOGRAPHIC_APOSTROPHE = /’/g
const SEPARATORS = /[\s\-–]+/g
const SPACES = /\s+/g

/**
 * The key under which a congregation of speakers is unique: case, accents, runs of spaces and hyphens ignored, so
 * « Montreuil-Est » and « MONTREUIL EST » are one congregation. The migration that created SpeakerCongregation
 * (20261111180000_add_speaker_congregations) computes the same key in SQL, and the archive import replays it: the
 * three must agree, or the same name lands in two congregations.
 */
export function normalizeCongregationName(name: string): string {
  return stripDiacritics(name.replace(TYPOGRAPHIC_APOSTROPHE, "'").replace(SEPARATORS, ' ').trim())
}

/** The name as displayed: the person's spelling, trimmed, with single spaces. */
export function tidyCongregationName(name: string): string {
  return name.replace(SPACES, ' ').trim()
}

/** The same folding for a speaker's name: « Jean-Marc FAURE » and « jean marc faure » are one person. */
export function normalizeSpeakerName(name: string): string {
  return normalizeCongregationName(name)
}
