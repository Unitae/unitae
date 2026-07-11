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
