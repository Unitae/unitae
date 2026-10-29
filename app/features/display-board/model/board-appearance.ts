import { DynamicType } from './dynamic-document.type'

// How a board document looks, on the board and on paper: a typeface, an accent and a layout,
// each from a short list checked on paper. Nothing else about a document is themable, so every
// combination stays legible pinned up a metre away and printed in black and white.

export const BOARD_TYPEFACES = ['fira', 'atkinson', 'serif'] as const
export type BoardTypeface = (typeof BOARD_TYPEFACES)[number]

export const BOARD_TYPEFACE_FAMILY: Record<BoardTypeface, string> = {
  fira: 'Fira Sans',
  atkinson: 'Atkinson Hyperlegible',
  serif: 'Source Serif 4',
}

// Each accent reads at 4.5:1 or better on white and still prints lighter than the black text on
// an office printer, so a label stays a label.
export const BOARD_ACCENTS = ['teal', 'blue', 'indigo', 'plum', 'wine', 'brick', 'olive', 'slate', 'black'] as const
export type BoardAccent = (typeof BOARD_ACCENTS)[number]

export const BOARD_ACCENT_COLOR: Record<BoardAccent, string> = {
  teal: '#0f766e',
  blue: '#1d4ed8',
  indigo: '#4338ca',
  plum: '#86198f',
  wine: '#9f1239',
  brick: '#b23c17',
  olive: '#4d6b12',
  slate: '#475569',
  black: '#000000',
}

/** The layouts each document offers, its default first. */
export const BOARD_LAYOUTS = {
  [DynamicType.PublisherGroups]: ['directory', 'columns', 'bands'],
  [DynamicType.Organigram]: ['leader', 'chart'],
  [DynamicType.Pioneers]: ['sections', 'columns'],
  [DynamicType.Programme]: ['list'],
} as const satisfies Record<DynamicType, readonly string[]>

export type BoardLayout<T extends DynamicType = DynamicType> = (typeof BOARD_LAYOUTS)[T][number]

export interface BoardAppearance<T extends DynamicType = DynamicType> {
  typeface: BoardTypeface
  accent: BoardAccent
  layout: BoardLayout<T>
}

export function defaultAppearance<T extends DynamicType>(type: T): BoardAppearance<T> {
  return { typeface: 'fira', accent: 'teal', layout: BOARD_LAYOUTS[type][0] }
}

export function isBoardLayout<T extends DynamicType>(type: T, layout: unknown): layout is BoardLayout<T> {
  return (BOARD_LAYOUTS[type] as readonly unknown[]).includes(layout)
}
