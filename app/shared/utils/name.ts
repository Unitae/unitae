import { z } from 'zod'

// Person-name field shared by member and account forms.
//
// - `.trim()` runs first so leading/trailing whitespace is silently
//   normalised (a common paste artefact from copying names out of docs).
// - `.min(1)` runs AFTER trim, so a whitespace-only input rejects.
// - `.max(100)` is a defensive upper bound. Real names are far shorter;
//   longer input is either an attack or a bug in the caller.
//
// Diacritics, hyphens, apostrophes, and non-Latin scripts are ALL allowed
// — enforcing a "letters only" regex would reject Zoé, Jean-Claude,
// O'Brien, or 山田 太郎. The `firstnameNormalized` / `lastnameNormalized`
// search-aid columns handle diacritic folding downstream.
export const nameSchema = z.string().trim().min(1).max(100)
