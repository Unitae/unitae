import * as m from '~/i18n/paraglide/messages'

// The page « Notre liste » is printed on, shared by the server that measures the addresses and the document that sets
// them, so the two cannot disagree on how much room a column has.

export const OUR_LIST_MARGIN = { top: 28, bottom: 40, horizontal: 36 }
const A4_WIDTH = 595.28

/** Each column's share of the line. */
export const OUR_LIST_COLUMNS = { name: 0.29, phone: 0.17, email: 0.36, talks: 0.18 } as const
/** The room left between a cell and the next. */
export const OUR_LIST_CELL_GAP = 8
export const OUR_LIST_TEXT_SIZE = 10
const SMALLEST_ADDRESS_SIZE = 7

/** The width an e-mail address has, in points. */
export const ADDRESS_ROOM = (A4_WIDTH - 2 * OUR_LIST_MARGIN.horizontal) * OUR_LIST_COLUMNS.email - OUR_LIST_CELL_GAP

const quarterPointsFitting = (widthAt1pt: number) =>
  Math.min(OUR_LIST_TEXT_SIZE, Math.max(SMALLEST_ADDRESS_SIZE, Math.floor((ADDRESS_ROOM / widthAt1pt) * 4) / 4))

/**
 * How an e-mail address is set. It has no space to wrap on, and a break inside it would print a hyphen that is not in
 * the address, so a long one is set smaller, by quarter points, until it holds on its line. One still too long at the
 * smallest size goes on two lines, after its « @ », the longer half deciding the size.
 *
 * @param whole the address's width at 1pt
 * @param longestHalf the width at 1pt of the longer of « local@ » and « domain »
 */
export function addressFit(whole: number, longestHalf: number): { size: number; split: boolean } {
  if (whole * OUR_LIST_TEXT_SIZE <= ADDRESS_ROOM) return { size: OUR_LIST_TEXT_SIZE, split: false }
  if (whole * SMALLEST_ADDRESS_SIZE <= ADDRESS_ROOM) return { size: quarterPointsFitting(whole), split: false }
  return { size: quarterPointsFitting(longestHalf), split: true }
}

/** « local@ » and « domain », the two lines of a split address. */
export function addressHalves(address: string): [string, string] {
  const at = address.lastIndexOf('@')
  return at === -1 ? [address, ''] : [address.slice(0, at + 1), address.slice(at + 1)]
}

const ACCENTS = /\p{M}/gu
const UNSAFE_FILENAME = /[^\w .()-]/g
const MAX_FILENAME = 50

/**
 * The PDF's file name, « orateurs les lilas 2026-11-11.pdf »: in characters every mail client and browser keeps as is —
 * no accents, no typographic quotes — so the attachment arrives with the name the send dialog showed.
 */
export function ourListFilename(congregationName: string, day: string): string {
  const name = m
    .external_speakers_pdf_filename({ name: congregationName, date: day })
    .normalize('NFD')
    .replace(ACCENTS, '')
    .replace(UNSAFE_FILENAME, '_')
    .toLowerCase()
    .slice(0, MAX_FILENAME)
  return `${name || 'speakers'}.pdf`
}
