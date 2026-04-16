import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import logger from '~/shared/libs/logger.server'
import { getBoardFileBuffer } from './document-storage'

const execFileAsync = promisify(execFile)

const THUMBNAIL_WIDTH = 300

export async function generateThumbnail(pdfStorageKey: string): Promise<Buffer | null> {
  let tempDir: string | null = null

  try {
    const pdfBuffer = await getBoardFileBuffer(pdfStorageKey)
    if (!pdfBuffer) return null

    tempDir = await mkdtemp(join(tmpdir(), 'unitae-thumb-'))
    const pdfPath = join(tempDir, 'input.pdf')
    const outputPrefix = join(tempDir, 'thumb')

    await writeFile(pdfPath, pdfBuffer)

    // pdftoppm renders PDF page to image — first page only (-l 1 -f 1)
    await execFileAsync('pdftoppm', [
      '-png',
      '-f',
      '1',
      '-l',
      '1',
      '-scale-to',
      String(THUMBNAIL_WIDTH),
      '-singlefile',
      pdfPath,
      outputPrefix,
    ])

    const thumbnailPath = `${outputPrefix}.png`
    return await readFile(thumbnailPath)
  } catch (error) {
    logger.error('Failed to generate PDF thumbnail', { error, pdfStorageKey })
    return null
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}
