// Detects an address-like prefix: a number, optionally followed by a French
// repeater (`bis`, `ter`, `quater`), then the street name. Used to split a
// search query into `[number, street]` so both pieces can be matched against
// the relevant Building fields.
export const addressRegex = /^(\d+\s*(bis|ter|quater)?)\s+(.+)$/

// Leading `@` is the explicit "force proximity" marker. Hoisted so filter
// files can strip it without re-allocating a literal per call.
export const proximityPrefix = /^@/
