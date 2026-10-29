import type { BoardTypeface } from '~/features/display-board/model/board-appearance'

// The board documents' typefaces on screen, from Google Fonts like the rest of the app's type:
// the content security policy already allows it, and a browser only downloads a face it uses.

export const BOARD_WEB_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Fira+Sans:ital,wght@0,400;0,700;1,400&family=Source+Serif+4:ital,wght@0,400;0,700;1,400&display=swap'

export const BOARD_WEB_FONT_STACK: Record<BoardTypeface, string> = {
  fira: '"Fira Sans", ui-sans-serif, sans-serif',
  atkinson: '"Atkinson Hyperlegible", ui-sans-serif, sans-serif',
  serif: '"Source Serif 4", Georgia, ui-serif, serif',
}
