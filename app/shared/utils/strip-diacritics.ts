// Lowercases and strips diacritics so search compares against the normalized
// columns stored on Member/Building. NFD splits each accented codepoint into
// base + combining mark, then the regex drops the marks.
export function stripDiacritics(input: string): string {
  return input.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}
