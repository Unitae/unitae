import JsZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { fallbackServiceOrders, readManifest, readNdjsonFile, writeNdjsonFile } from './ndjson-archive'

const MISSING_MANIFEST_PATTERN = /missing manifest\.json/

describe('readManifest', () => {
  it('parses manifest.json from the archive', async () => {
    const zip = new JsZip()
    zip.file('manifest.json', JSON.stringify({ version: '2.0', entityCounts: { users: 3 } }))
    const manifest = await readManifest(zip)
    expect(manifest.version).toBe('2.0')
    expect(manifest.entityCounts).toEqual({ users: 3 })
  })

  it('throws when manifest.json is missing', async () => {
    const zip = new JsZip()
    await expect(readManifest(zip)).rejects.toThrow(MISSING_MANIFEST_PATTERN)
  })
})

describe('readNdjsonFile', () => {
  it('returns [] when the file is absent', async () => {
    const zip = new JsZip()
    expect(await readNdjsonFile(zip, 'members')).toEqual([])
  })

  it('parses one record per non-empty line', async () => {
    const zip = new JsZip()
    zip.file('data/members.ndjson', '{"id":1}\n{"id":2}\n\n{"id":3}\n')
    expect(await readNdjsonFile<{ id: number }>(zip, 'members')).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
  })
})

describe('writeNdjsonFile', () => {
  it('writes an empty file for an empty record list', async () => {
    const zip = new JsZip()
    writeNdjsonFile(zip, 'members', [])
    const content = await zip.file('data/members.ndjson')?.async('string')
    expect(content).toBe('')
  })

  it('writes one JSON object per line with a trailing newline', async () => {
    const zip = new JsZip()
    writeNdjsonFile(zip, 'members', [{ id: 1 }, { id: 2 }])
    const content = await zip.file('data/members.ndjson')?.async('string')
    expect(content).toBe('{"id":1}\n{"id":2}\n')
  })
})

describe('fallbackServiceOrders', () => {
  it('numbers each parent’s services by id, from 0 in steps of 5, whatever the file’s order', () => {
    const records = [
      { id: 7, eventId: 2 },
      { id: 3, eventId: 1 },
      { id: 5, eventId: 2 },
      { id: 1, eventId: 1 },
      { id: 9, eventId: 1 },
    ]

    const orders = fallbackServiceOrders(records, record => record.eventId)

    expect(Object.fromEntries(orders)).toEqual({ 1: 0, 3: 5, 9: 10, 5: 0, 7: 5 })
  })
})
