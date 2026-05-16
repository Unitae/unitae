/**
 * Strips invisible Unicode formatting codepoints that cause leading characters
 * to appear dropped in PDF output: the font lacks a glyph for them, but the
 * codepoint still sits in the content stream taking up logical position.
 *
 * Removed:
 *   U+00AD                   soft hyphen
 *   U+034F                   combining grapheme joiner
 *   U+180E                   Mongolian vowel separator (deprecated)
 *   U+200B - U+200D, U+2060  zero-width space / joiners / word joiner
 *   U+202A - U+202E          bidi embedding / override
 *   U+2066 - U+2069          bidi isolate
 *   U+FEFF                   BOM / zero-width no-break space
 */
const INVISIBLE_RE = /[\u00AD\u180E\u200B-\u200D\u2060\u202A-\u202E\u2066-\u2069\uFEFF]|\u034F/g

export function sanitizeText(input: string): string {
  return input.replace(INVISIBLE_RE, '')
}
