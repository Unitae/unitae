import { createCanvas } from 'canvas'
import type { RenderParameters } from 'pdfjs-dist/types/src/display/api'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import logger from '~/shared/libs/logger.server'
import { getBoardFileBuffer } from './document-storage'

const THUMBNAIL_WIDTH = 200
const THUMBNAIL_SCALE = 1.5

export async function generateThumbnail(pdfStorageKey: string): Promise<Buffer | null> {
  try {
    const pdfBuffer = await getBoardFileBuffer(pdfStorageKey)
    if (!pdfBuffer) return null

    const pdfData = new Uint8Array(pdfBuffer)
    const pdf = await getDocument({ data: pdfData, useSystemFonts: true }).promise
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: THUMBNAIL_SCALE })

    const scale = THUMBNAIL_WIDTH / viewport.width
    const scaledViewport = page.getViewport({ scale: THUMBNAIL_SCALE * scale })

    const canvas = createCanvas(scaledViewport.width, scaledViewport.height)
    const context = canvas.getContext('2d')

    // node-canvas context is compatible with pdfjs-dist at runtime but types diverge
    const renderParams = { canvasContext: context, viewport: scaledViewport } as unknown as RenderParameters
    await page.render(renderParams).promise

    return canvas.toBuffer('image/png')
  } catch (error) {
    logger.error('Failed to generate PDF thumbnail', { error, pdfStorageKey })
    return null
  }
}
