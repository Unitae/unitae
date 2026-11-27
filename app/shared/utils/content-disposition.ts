// Letters NFD does not split into a base and an accent: œ, Œ, æ, Æ, ß.
const LIGATURES = new Map([
  ['\u0153', 'oe'],
  ['\u0152', 'OE'],
  ['\u00e6', 'ae'],
  ['\u00c6', 'AE'],
  ['\u00df', 'ss'],
])
const LIGATURE_RE = /[\u0153\u0152\u00e6\u00c6\u00df]/g
const MARK_RE = /\p{M}/gu
const NOT_PRINTABLE_ASCII_RE = /[^\x20-\x7e]/g
const QUOTE_OR_BACKSLASH_RE = /["\\]/g
// encodeURIComponent leaves these, which RFC 5987 does not allow in a value.
const RFC5987_EXTRA_RE = /['()*]/g

/**
 * The Content-Disposition of a file named `filename`, downloaded (`attachment`) or shown (`inline`). A header carries
 * Latin-1 only, so a name in Cyrillic or with « œ » made `new Response()` throw: the name goes in UTF-8 as `filename*`
 * (RFC 6266), with an ASCII `filename` beside it, accents dropped, quotes removed and any other letter replaced, for
 * clients that read only that one.
 */
export function contentDisposition(filename: string, disposition: 'attachment' | 'inline' = 'attachment'): string {
  const ascii = filename
    .replace(LIGATURE_RE, letter => LIGATURES.get(letter) ?? letter)
    .normalize('NFD')
    .replace(MARK_RE, '')
    .replace(NOT_PRINTABLE_ASCII_RE, '_')
    .replace(QUOTE_OR_BACKSLASH_RE, '')
  const utf8 = encodeURIComponent(filename).replace(
    RFC5987_EXTRA_RE,
    char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${utf8}`
}
