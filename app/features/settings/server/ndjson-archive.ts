import type JsZip from 'jszip'
import type { ManifestJson } from './data-transfer.type'

export async function readManifest(zip: JsZip): Promise<ManifestJson> {
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) {
    throw new Error('Invalid archive: missing manifest.json')
  }
  return JSON.parse(await manifestFile.async('string')) as ManifestJson
}

export async function readNdjsonFile<T>(zip: JsZip, name: string): Promise<T[]> {
  const file = zip.file(`data/${name}.ndjson`)
  if (!file) return []
  const content = await file.async('string')
  return content
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line) as T)
}

export function writeNdjsonFile(zip: JsZip, name: string, records: object[]): void {
  if (records.length === 0) {
    zip.file(`data/${name}.ndjson`, '')
    return
  }
  const content = `${records.map(r => JSON.stringify(r)).join('\n')}\n`
  zip.file(`data/${name}.ndjson`, content)
}

/**
 * The order of services from an archive written before they had one (pre-2.17): by their id in the archive — the order
 * they were created in, the migration's rule — each parent counting from 0 in steps of 5. The file's own row order says
 * nothing: the export had no ORDER BY, and an updated row moves in the table.
 */
export function fallbackServiceOrders<R extends { id: number }>(
  records: R[],
  parentOf: (record: R) => number,
): Map<number, number> {
  const orders = new Map<number, number>()
  const next = new Map<number, number>()
  for (const record of [...records].sort((a, b) => a.id - b.id)) {
    const parent = parentOf(record)
    const position = next.get(parent) ?? 0
    next.set(parent, position + 1)
    orders.set(record.id, position * 5)
  }
  return orders
}
