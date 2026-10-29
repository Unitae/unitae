// The page every board sheet is printed on, shared by the sheets that plan their pages and by
// the components that draw them, so the two cannot disagree on how much room there is.

export const SHEET_MARGIN = { top: 28, bottom: 30, horizontal: 36 }

const A4 = { width: 595.28, height: 841.89 }

export type SheetOrientation = 'portrait' | 'landscape'

/** The printable area inside the margins. */
export function sheetContentBox(orientation: SheetOrientation): { width: number; height: number } {
  const [width, height] = orientation === 'portrait' ? [A4.width, A4.height] : [A4.height, A4.width]
  return { width: width - 2 * SHEET_MARGIN.horizontal, height: height - SHEET_MARGIN.top - SHEET_MARGIN.bottom }
}

/** The text sizes a sheet that fits itself may take, largest first; the user allowed 9pt. */
export const AUTO_FIT_SIZES = [12, 11.5, 11, 10.5, 10, 9.5, 9]

/** What a sheet plans to fill of a page, keeping room for the estimate's rounding. */
export const SAFE_FILL = 0.97

// The masthead: congregation (10pt) over the title (20pt), a heavy rule, then a gap.
export const MASTHEAD = { congregationSize: 10, titleSize: 20, lineHeight: 1.2, rule: 2.5, gap: 10, padding: 6 }

/** The height the masthead takes on the first page, rule and gap included. */
export function mastheadHeight(): number {
  const { congregationSize, titleSize, lineHeight, rule, gap, padding } = MASTHEAD
  return congregationSize * lineHeight + 1 + titleSize * lineHeight + padding + rule + gap
}

// Each entry after the first in a column opens on a black rule, padding included.
export const ENTRY_RULE = { width: 1, padding: 6 }
export const ENTRY_RULE_HEIGHT = ENTRY_RULE.width + ENTRY_RULE.padding
