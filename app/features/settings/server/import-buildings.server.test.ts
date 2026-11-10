import JsZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { importBuildings } from './import-buildings.server'
import { writeNdjsonFile } from './ndjson-archive'

function archive(records: object[]) {
  const zip = new JsZip()
  writeNdjsonFile(zip, 'buildings', records)
  return zip
}

function record(overrides: Record<string, unknown>) {
  return {
    id: 1,
    number: '1',
    street: 'Rue de Paris',
    zip: '93260',
    latitude: null,
    longitude: null,
    active: true,
    inTerritory: true,
    inOpenData: false,
    prospectionDate: null,
    notes: '',
    importantNotes: '',
    ...overrides,
  }
}

async function importedLastSeen(records: object[]) {
  const created: { lastSeenInSourceAt: Date | null }[] = []
  const db = {
    building: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(({ data }: { data: { lastSeenInSourceAt: Date | null } }) => {
        created.push(data)
        return Promise.resolve({ id: created.length })
      }),
    },
  }
  await importBuildings(archive(records), db as never, { set: vi.fn() } as never, 42)
  return created.map(data => data.lastSeenInSourceAt)
}

describe('importBuildings — when a sync last listed the building', () => {
  it('keeps the date the archive carries', async () => {
    const [seen] = await importedLastSeen([
      record({ inOpenData: true, lastSeenInSourceAt: '2026-10-03T08:00:00.000Z' }),
    ])
    expect(seen?.toISOString()).toBe('2026-10-03T08:00:00.000Z')
  })

  it('keeps a building the archive says no sync ever listed undated', async () => {
    expect(await importedLastSeen([record({ inOpenData: false, lastSeenInSourceAt: null })])).toEqual([null])
  })

  it('reads an older archive like the migration did: listed means seen now, otherwise never', async () => {
    const [listed, handMade] = await importedLastSeen([
      record({ id: 1, number: '1', inOpenData: true }),
      record({ id: 2, number: '2', inOpenData: false }),
    ])
    expect(listed).toBeInstanceOf(Date)
    expect(handMade).toBeNull()
  })
})
