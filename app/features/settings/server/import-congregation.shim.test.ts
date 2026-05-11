import JsZip from 'jszip'
import { beforeEach, describe, expect, it } from 'vitest'

import { migrateLegacyUsersNdjson } from './import-congregation.server'

interface LegacyRow {
  id: number
  firstname: string
  lastname: string
  email: string
  active: boolean
  emailVerifiedAt: string | null
  isPublisher: boolean
  type?: string
  isMale?: boolean | null
  birthDate?: string | null
  baptismDate?: string | null
  isHelder?: boolean
  isServant?: boolean
  isAnointed?: boolean
  publisherGroupId?: number | null
  phone?: string
  address?: string
  anonymizedAt?: string | null
  createdAt: string
  updatedAt: string
}

function buildLegacyZip(rows: LegacyRow[]): JsZip {
  const zip = new JsZip()
  const ndjson = rows.map(r => JSON.stringify(r)).join('\n') + (rows.length > 0 ? '\n' : '')
  zip.file('data/users.ndjson', ndjson)
  return zip
}

async function readNdjson<T>(zip: JsZip, name: string): Promise<T[]> {
  const file = zip.file(`data/${name}.ndjson`)
  if (!file) return []
  const content = await file.async('string')
  return content
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line) as T)
}

const baseRow: Omit<LegacyRow, 'id' | 'email' | 'firstname' | 'lastname' | 'isPublisher'> = {
  active: true,
  emailVerifiedAt: '2024-01-01T00:00:00.000Z',
  type: 'normal',
  isMale: true,
  phone: '',
  address: '',
  birthDate: null,
  baptismDate: null,
  isHelder: false,
  isServant: false,
  isAnointed: false,
  publisherGroupId: null,
  anonymizedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

describe('migrateLegacyUsersNdjson', () => {
  let zip: JsZip

  beforeEach(() => {
    zip = new JsZip()
  })

  it('is a no-op for v2.0 archives', async () => {
    const warnings = await migrateLegacyUsersNdjson(zip, '2.0')
    expect(warnings).toEqual([])
    expect(zip.file('data/members.ndjson')).toBeNull()
  })

  it('is a no-op when the archive already has v2.0 entities', async () => {
    zip = buildLegacyZip([])
    zip.file('data/members.ndjson', '[]')
    const warnings = await migrateLegacyUsersNdjson(zip, '1.1')
    expect(warnings).toEqual([])
  })

  it('splits a publisher row into both members + user-accounts with linked id', async () => {
    zip = buildLegacyZip([
      {
        id: 1,
        firstname: 'Alice',
        lastname: 'Pub',
        email: 'alice@test.com',
        isPublisher: true,
        ...baseRow,
      },
    ])

    const warnings = await migrateLegacyUsersNdjson(zip, '1.1')
    expect(warnings.length).toBeGreaterThan(0)

    const members = await readNdjson<{ id: number; firstname: string; isPublisher: boolean }>(zip, 'members')
    const accounts = await readNdjson<{ id: number; email: string; memberId: number | null }>(zip, 'user-accounts')

    expect(members).toHaveLength(1)
    expect(members[0]).toMatchObject({ id: 1, firstname: 'Alice', isPublisher: true })
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({ id: 1, email: 'alice@test.com', memberId: 1 })
  })

  it('produces only a Member for placeholder-email rows (account dropped)', async () => {
    zip = buildLegacyZip([
      {
        id: 2,
        firstname: 'Bob',
        lastname: 'Offline',
        email: 'bob.offline@placeholder.unitae.app',
        isPublisher: true,
        ...baseRow,
      },
    ])

    const warnings = await migrateLegacyUsersNdjson(zip, '1.1')
    expect(warnings.some(w => w.includes('placeholder-email'))).toBe(true)

    const members = await readNdjson<{ id: number }>(zip, 'members')
    const accounts = await readNdjson<{ id: number }>(zip, 'user-accounts')
    expect(members).toHaveLength(1)
    expect(accounts).toHaveLength(0)
  })

  it('produces only a UserAccount for account-only admins (no publisher signals)', async () => {
    zip = buildLegacyZip([
      {
        id: 3,
        firstname: 'Carol',
        lastname: 'Admin',
        email: 'admin@test.com',
        isPublisher: false,
        ...baseRow,
      },
    ])

    const warnings = await migrateLegacyUsersNdjson(zip, '1.0')
    expect(warnings.length).toBeGreaterThan(0)

    const members = await readNdjson<{ id: number }>(zip, 'members')
    const accounts = await readNdjson<{ id: number; firstname: string | null; memberId: number | null }>(
      zip,
      'user-accounts',
    )

    expect(members).toHaveLength(0)
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({ id: 3, firstname: 'Carol', memberId: null })
  })

  it('infers Member from baptism-date alone (non-publisher with baptism)', async () => {
    zip = buildLegacyZip([
      {
        id: 4,
        firstname: 'Dan',
        lastname: 'Baptized',
        email: 'dan@test.com',
        isPublisher: false,
        ...baseRow,
        baptismDate: '2010-06-01',
      },
    ])

    await migrateLegacyUsersNdjson(zip, '1.1')

    const members = await readNdjson<{ id: number; baptismDate: string | null }>(zip, 'members')
    expect(members).toHaveLength(1)
    expect(members[0].baptismDate).toBe('2010-06-01')
  })
})
