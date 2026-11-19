import { StyleSheet, Text } from '@react-pdf/renderer'
import { createContext, useContext } from 'react'
import * as m from '~/i18n/paraglide/messages'
import type { Locale } from '~/i18n/paraglide/runtime'
import { PDF_FONT_FAMILY, registerPdfFonts } from '~/shared/ui/pdf-fonts'

registerPdfFonts()

/** Whether the PDF is printed for a visitor's demo copy. `renderPdfResponse` and `renderPdfBuffer` set it. */
export const PdfDemoContext = createContext(false)

const styles = StyleSheet.create({
  mark: {
    position: 'absolute',
    top: 8,
    right: 12,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 'bold',
    fontSize: 8,
    color: '#1d222b',
  },
})

/**
 * « Démo — données inventées » in the top corner of every page printed from a demo copy, which can hold anything a
 * visitor typed (docs/development/specs/demo-mode.md). Every `<Page>` of a document carries one; it prints nothing
 * for a real congregation. `locale` is for a PDF rendered outside a request, where the reader's language isn't set.
 */
export function PdfDemoMark({ locale }: { locale?: Locale }) {
  if (!useContext(PdfDemoContext)) return null
  return (
    <Text style={styles.mark} fixed>
      {m.demo_banner_label({}, locale ? { locale } : undefined)}
    </Text>
  )
}
