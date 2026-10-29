import type { DocumentProps } from '@react-pdf/renderer'
import { Font, pdf } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import logger from '~/shared/infra/logger.server'

export function sanitizeFilename(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 50)
}

interface LayoutFont {
  characterSet: number[]
  layout(text: string): unknown
}

function isLayoutFont(data: unknown): data is LayoutFont {
  return (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as LayoutFont).characterSet) &&
    typeof (data as LayoutFont).layout === 'function'
  )
}

const warmed = new WeakSet<object>()

/**
 * Every PDF the server renders shares one font object per registered face, and that object
 * caches each glyph the first time it meets it. A glyph met while laying out text keeps the
 * character it stands for. A glyph first met as a component of a composite while a PDF is
 * subsetted (« É » is drawn as « E » plus an accent) is cached with none, and every later PDF
 * set in that face silently drops the letter. Laying out every character of each face before
 * any PDF is written caches every glyph with its character.
 */
async function warmRegisteredFonts() {
  for (const family of Object.values(Font.getRegisteredFonts())) {
    for (const source of family.sources) {
      if (warmed.has(source)) continue
      warmed.add(source)
      // A face registered twice resolves to its first registration; the others are never used.
      const descriptor = { fontFamily: family.family, fontStyle: source.fontStyle, fontWeight: source.fontWeight }
      if (family.resolve(descriptor) !== source) continue
      await source.load()
      if (isLayoutFont(source.data)) {
        source.data.layout(source.data.characterSet.map(codePoint => String.fromCodePoint(codePoint)).join(' '))
      }
    }
  }
}

export async function renderPdfResponse(document: ReactElement<DocumentProps>, filename: string): Promise<Response> {
  let blob: Blob
  try {
    await warmRegisteredFonts()
    blob = await pdf(document).toBlob()
  } catch (error) {
    logger.error('PDF rendering failed', { error })
    return new Response('PDF generation failed', { status: 500 })
  }

  return new Response(blob, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(blob.size),
      'Cache-Control': 'private, no-store',
    },
  })
}
