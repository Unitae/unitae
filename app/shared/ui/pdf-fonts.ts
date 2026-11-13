import path from 'node:path'
import { Font } from '@react-pdf/renderer'

/**
 * The typeface of the printed documents (territory cards, publisher records, the emergency roster).
 *
 * react-pdf's built-in Helvetica has no Cyrillic, so a name or a label in Ukrainian or Russian
 * printed blank. Fira Sans ships with the app and covers Latin and Cyrillic alike.
 */
export const PDF_FONT_FAMILY = 'Fira Sans'

/** The serif the forms print their values in, where they used Times, which has no Cyrillic either. */
export const PDF_SERIF_FAMILY = 'Source Serif 4'

let registered = false

/** Registers the typeface once per process; every document module calls it before declaring its styles. */
export function registerPdfFonts(): void {
  if (registered) return
  registered = true
  const fontsDir = path.join(process.cwd(), 'public', 'fonts')
  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: path.join(fontsDir, 'FiraSans-Regular.ttf') },
      { src: path.join(fontsDir, 'FiraSans-Regular.ttf'), fontWeight: 500 },
      { src: path.join(fontsDir, 'FiraSans-Bold.ttf'), fontWeight: 'bold' },
      { src: path.join(fontsDir, 'FiraSans-Italic.ttf'), fontStyle: 'italic' },
      { src: path.join(fontsDir, 'FiraSans-BoldItalic.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
    ],
  })
  Font.register({
    family: PDF_SERIF_FAMILY,
    fonts: [
      { src: path.join(fontsDir, 'SourceSerif4-Regular.ttf') },
      { src: path.join(fontsDir, 'SourceSerif4-Bold.ttf'), fontWeight: 'bold' },
      { src: path.join(fontsDir, 'SourceSerif4-It.ttf'), fontStyle: 'italic' },
      { src: path.join(fontsDir, 'SourceSerif4-BoldIt.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
    ],
  })
}
