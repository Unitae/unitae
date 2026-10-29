import path from 'node:path'
import { Font } from '@react-pdf/renderer'
import { BOARD_TYPEFACE_FAMILY, type BoardTypeface } from '~/features/display-board/model/board-appearance'
import type { TextMeasurer, TextWeight } from '~/features/display-board/model/sheet-text'

// The board sheets' typefaces, registered with react-pdf once per process, and the measures the
// sheets plan their pages with. The measures come from the very font objects react-pdf lays the
// text out with, so a sheet's plan and its print cannot disagree.

const FILES: Record<BoardTypeface, { regular: string; bold: string; italic: string; boldItalic: string }> = {
  fira: {
    regular: 'FiraSans-Regular.ttf',
    bold: 'FiraSans-Bold.ttf',
    italic: 'FiraSans-Italic.ttf',
    boldItalic: 'FiraSans-BoldItalic.ttf',
  },
  atkinson: {
    regular: 'AtkinsonHyperlegible-Regular.ttf',
    bold: 'AtkinsonHyperlegible-Bold.ttf',
    italic: 'AtkinsonHyperlegible-Italic.ttf',
    boldItalic: 'AtkinsonHyperlegible-BoldItalic.ttf',
  },
  serif: {
    regular: 'SourceSerif4-Regular.ttf',
    bold: 'SourceSerif4-Bold.ttf',
    italic: 'SourceSerif4-It.ttf',
    boldItalic: 'SourceSerif4-BoldIt.ttf',
  },
}

/** The family a character falls back to when a typeface lacks it: Fira Sans covers the most. */
export const BOARD_FALLBACK_FAMILY = BOARD_TYPEFACE_FAMILY.fira

let registered = false

export function registerBoardPdfFonts() {
  if (registered) return
  registered = true
  const fontsDir = path.join(process.cwd(), 'public', 'fonts')
  for (const [typeface, files] of Object.entries(FILES) as [BoardTypeface, (typeof FILES)[BoardTypeface]][]) {
    Font.register({
      family: BOARD_TYPEFACE_FAMILY[typeface],
      fonts: [
        { src: path.join(fontsDir, files.regular) },
        { src: path.join(fontsDir, files.bold), fontWeight: 'bold' },
        { src: path.join(fontsDir, files.italic), fontStyle: 'italic' },
        { src: path.join(fontsDir, files.boldItalic), fontWeight: 'bold', fontStyle: 'italic' },
      ],
    })
  }
}

interface MeasurableFont {
  unitsPerEm: number
  ascent: number
  layout(text: string): { advanceWidth: number }
  hasGlyphForCodePoint(codePoint: number): boolean
}

function isMeasurableFont(data: unknown): data is MeasurableFont {
  if (typeof data !== 'object' || data === null) return false
  const font = data as MeasurableFont
  return typeof font.unitsPerEm === 'number' && typeof font.layout === 'function'
}

async function loadFace(fontFamily: string, weight: TextWeight): Promise<MeasurableFont> {
  const source = Font.getFont({ fontFamily, fontWeight: weight === 'bold' ? 700 : 400 })
  await source.load()
  if (!isMeasurableFont(source.data)) throw new Error(`Board PDF font ${fontFamily} ${weight} did not load`)
  return source.data
}

/** Splits text into the stretches the face can set and the ones that fall back. */
function coverage(text: string, font: MeasurableFont): { text: string; covered: boolean }[] {
  const stretches: { text: string; covered: boolean }[] = []
  for (const character of text) {
    const covered = font.hasGlyphForCodePoint(character.codePointAt(0) ?? 0)
    const last = stretches[stretches.length - 1]
    if (last && last.covered === covered) last.text += character
    else stretches.push({ text: character, covered })
  }
  return stretches
}

const measurers = new Map<BoardTypeface, Promise<TextMeasurer>>()

/**
 * Loads a typeface for a sheet and returns its measures. A character the typeface lacks is
 * measured in Fira Sans, the family the sheet falls back to for it.
 */
export function loadBoardPdfTypeface(typeface: BoardTypeface): Promise<TextMeasurer> {
  registerBoardPdfFonts()
  let measurer = measurers.get(typeface)
  if (!measurer) {
    measurer = (async (): Promise<TextMeasurer> => {
      const family = BOARD_TYPEFACE_FAMILY[typeface]
      const faces = { regular: await loadFace(family, 'regular'), bold: await loadFace(family, 'bold') }
      const fallback = {
        regular: await loadFace(BOARD_FALLBACK_FAMILY, 'regular'),
        bold: await loadFace(BOARD_FALLBACK_FAMILY, 'bold'),
      }
      const widths = new Map<string, number>()
      const unitWidth = (text: string, font: MeasurableFont) => font.layout(text).advanceWidth / font.unitsPerEm
      return {
        width(text, weight) {
          const key = `${weight}:${text}`
          let width = widths.get(key)
          if (width === undefined) {
            width = coverage(text, faces[weight]).reduce(
              (total, stretch) => total + unitWidth(stretch.text, stretch.covered ? faces[weight] : fallback[weight]),
              0,
            )
            widths.set(key, width)
          }
          return width
        },
        baseline: faces.regular.ascent / faces.regular.unitsPerEm,
      }
    })()
    measurers.set(typeface, measurer)
  }
  return measurer
}
