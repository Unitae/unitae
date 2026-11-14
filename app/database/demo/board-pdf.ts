import { Document, Page, pdf, StyleSheet, Text, type TextProps, View } from '@react-pdf/renderer'
import { createElement as h, type ReactNode } from 'react'
import type { BoardBlock, BoardDocumentSeed } from './board'

const INK = '#1d222b'
const MUTED = '#5b6472'
const RULE = '#c9ced6'
const HAIRLINE = '#e2e5ea'
const MM = 72 / 25.4

const styles = StyleSheet.create({
  page: {
    paddingVertical: 22 * MM,
    paddingHorizontal: 20 * MM,
    fontFamily: 'Helvetica',
    fontSize: 11.5,
    lineHeight: 1.5,
    color: INK,
  },
  congregation: { fontSize: 9, letterSpacing: 0.7, textTransform: 'uppercase', color: MUTED, marginBottom: 6 * MM },
  title: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 20,
    lineHeight: 1.2,
    paddingBottom: 3 * MM,
    marginBottom: 8 * MM,
    borderBottomWidth: 1.5,
    borderBottomColor: INK,
  },
  paragraph: { marginBottom: 4 * MM },
  table: { marginTop: 4 * MM },
  headRow: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: RULE },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: HAIRLINE },
  head: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 9, color: MUTED, paddingVertical: 2 * MM },
  cell: { flex: 1, paddingVertical: 2.4 * MM, paddingRight: 2 * MM },
})

// French words, never cut by the default English hyphenation.
const line = (style: TextProps['style'], text: string, key?: number) =>
  h(Text, { key, style, hyphenationCallback: (word: string) => [word] }, text)

function block(item: BoardBlock, index: number): ReactNode {
  if (item.kind === 'paragraph') return line(styles.paragraph, item.text, index)
  return h(
    View,
    { key: index, style: styles.table },
    h(
      View,
      { style: styles.headRow },
      item.head.map((cell, column) => line(styles.head, cell, column)),
    ),
    item.rows.map((row, at) =>
      h(
        View,
        { key: at, style: styles.row, wrap: false },
        row.map((cell, column) => line(styles.cell, cell, column)),
      ),
    ),
  )
}

/** A board document as a congregation prints it: an A4 page with its name, the title and the text. */
export function boardPdf(congregation: string, document: BoardDocumentSeed): Promise<Blob> {
  return pdf(
    h(
      Document,
      { title: document.title },
      h(
        Page,
        { size: 'A4', style: styles.page },
        line(styles.congregation, congregation),
        line(styles.title, document.title),
        ...document.blocks.map(block),
      ),
    ),
  ).toBlob()
}
