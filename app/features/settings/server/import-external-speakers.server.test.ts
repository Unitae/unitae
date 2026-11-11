import { beforeEach, describe, expect, it, vi } from 'vitest'

const readNdjsonFile = vi.fn()
vi.mock('./ndjson-archive', () => ({ readNdjsonFile: (...args: unknown[]) => readNdjsonFile(...args) }))

const { importExternalSpeakers, importOurSpeakers, importSpeakerCongregations } = await import(
  './import-external-speakers.server'
)
const { EntityIdMap } = await import('./data-transfer.type')

function makeDb() {
  let nextCongregation = 500
  let nextSpeaker = 900
  return {
    speakerCongregation: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: nextCongregation++, ...data })),
    },
    externalSpeaker: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: nextSpeaker++, ...data })),
    },
    ourSpeaker: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 700, ...data })),
    },
  }
}

function archive(files: Record<string, unknown[]>) {
  readNdjsonFile.mockImplementation((_zip: unknown, name: string) => Promise.resolve(files[name] ?? []))
}

beforeEach(() => {
  vi.resetAllMocks()
})

const contacts = {
  responsibleName: 'Paul LEROY',
  responsiblePhone: '06 12 34 56 78',
  responsibleEmail: 'discours.bagnolet@exemple.fr',
  coordinatorName: '',
  coordinatorPhone: '',
  coordinatorEmail: '',
}

describe('a 2.13 archive', () => {
  it('recreates the congregations, then links each speaker through the id map', async () => {
    archive({
      'speaker-congregations': [
        { id: 3, name: 'Bagnolet', ...contacts, listDate: '2026-09-12T00:00:00.000Z', notes: '' },
      ],
      'external-speakers': [
        {
          id: 40,
          name: 'Paul LEROY',
          congregationName: 'Bagnolet',
          speakerCongregationId: 3,
          phone: '06 12 34 56 78',
          phone2: null,
          email: 'paul.leroy@exemple.fr',
          email2: 'discours.bagnolet@exemple.fr',
          notes: null,
          talks: [12, 54],
          archivedAt: null,
          anonymizedAt: null,
        },
      ],
    })
    const db = makeDb()
    const idMap = new EntityIdMap()

    await importSpeakerCongregations({} as never, db as never, idMap, 42)
    await importExternalSpeakers({} as never, db as never, idMap, 42)

    expect(db.speakerCongregation.create.mock.calls[0]?.[0].data).toMatchObject({
      name: 'Bagnolet',
      nameNormalized: 'bagnolet',
      responsibleName: 'Paul LEROY',
      listDate: new Date('2026-09-12T00:00:00.000Z'),
      congregationId: 42,
    })
    expect(db.externalSpeaker.create.mock.calls[0]?.[0].data).toMatchObject({
      speakerCongregationId: 500,
      email2: 'discours.bagnolet@exemple.fr',
      talks: [12, 54],
      congregationId: 42,
    })
    expect(idMap.get('external-speakers', 40)).toBe(900)
  })

  it('keeps a deleted speaker, nameless, so imported programmes still read « Orateur extérieur »', async () => {
    archive({
      'external-speakers': [
        {
          id: 41,
          name: '',
          congregationName: '',
          speakerCongregationId: null,
          phone: null,
          phone2: null,
          email: null,
          email2: null,
          notes: null,
          talks: [],
          archivedAt: '2025-01-03T00:00:00.000Z',
          anonymizedAt: '2026-02-01T00:00:00.000Z',
        },
      ],
    })
    const db = makeDb()

    await importExternalSpeakers({} as never, db as never, new EntityIdMap(), 42)

    expect(db.externalSpeaker.create.mock.calls[0]?.[0].data.anonymizedAt).toEqual(new Date('2026-02-01T00:00:00.000Z'))
  })
})

describe('an archive from before 2.13', () => {
  it('builds the congregations from the free text, one per spelling, as the migration did', async () => {
    const legacy = (id: number, name: string, congregationName: string) => ({
      id,
      name,
      congregationName,
      phone: null,
      email: null,
      notes: null,
      archivedAt: null,
    })
    archive({
      'external-speakers': [
        legacy(1, 'Paul LEROY', 'Bagnolet'),
        legacy(2, 'Hugo BLANC', 'Bagnolet'),
        legacy(3, 'Jean-Marc FAURE', 'BAGNOLET  '),
        legacy(4, 'Rémi GAUTIER', 'Montreuil-Est'),
        legacy(5, 'M. DIALLO', ''),
      ],
    })
    const db = makeDb()

    await importExternalSpeakers({} as never, db as never, new EntityIdMap(), 42)

    const congregations = db.speakerCongregation.create.mock.calls.map(([arg]) => arg.data)
    expect(congregations.map(c => [c.name, c.nameNormalized])).toEqual([
      ['Bagnolet', 'bagnolet'],
      ['Montreuil-Est', 'montreuil est'],
    ])
    const links = db.externalSpeaker.create.mock.calls.map(([arg]) => [arg.data.name, arg.data.speakerCongregationId])
    expect(links).toEqual([
      ['Paul LEROY', 500],
      ['Hugo BLANC', 500],
      ['Jean-Marc FAURE', 500],
      ['Rémi GAUTIER', 501],
      ['M. DIALLO', null],
    ])
    const paul = db.externalSpeaker.create.mock.calls[0]?.[0].data
    expect(paul).toMatchObject({ phone2: null, email2: null, talks: [], anonymizedAt: null })
  })
})

describe('a 2.14 archive', () => {
  it('keeps when our list went to each congregation, and how', async () => {
    archive({
      'speaker-congregations': [
        {
          id: 3,
          name: 'Bagnolet',
          ...contacts,
          listDate: null,
          notes: '',
          ourListSentAt: '2026-10-03T10:00:00.000Z',
          ourListSentManually: true,
          ourListSentDigest: 'sha-of-the-list',
        },
      ],
    })
    const db = makeDb()

    await importSpeakerCongregations({} as never, db as never, new EntityIdMap(), 1)

    expect(db.speakerCongregation.create.mock.calls[0]?.[0].data).toMatchObject({
      ourListSentAt: new Date('2026-10-03T10:00:00.000Z'),
      ourListSentManually: true,
      ourListSentDigest: 'sha-of-the-list',
    })
  })

  it('puts each brother of « Notre liste » back on his imported record, and drops one whose record is not there', async () => {
    archive({
      'our-speakers': [
        {
          memberId: 12,
          onList: true,
          talks: [4, 26],
          phoneMode: 'record',
          phoneCustom: '',
          phone2: '01 43 62 18 40',
          emailMode: 'custom',
          emailCustom: 'discours.lilas@exemple.fr',
          email2: '',
          note: 'Pas disponible en décembre',
        },
        {
          memberId: 99,
          onList: true,
          talks: [],
          phoneMode: 'record',
          phoneCustom: '',
          phone2: '',
          emailMode: 'record',
          emailCustom: '',
          email2: '',
          note: '',
        },
      ],
    })
    const db = makeDb()
    const idMap = new EntityIdMap()
    idMap.set('members', 12, 312)

    await importOurSpeakers({} as never, db as never, idMap, 1)

    expect(db.ourSpeaker.create).toHaveBeenCalledTimes(1)
    expect(db.ourSpeaker.create.mock.calls[0]?.[0].data).toMatchObject({
      memberId: 312,
      congregationId: 1,
      onList: true,
      talks: [4, 26],
      phone2: '01 43 62 18 40',
      emailMode: 'custom',
      emailCustom: 'discours.lilas@exemple.fr',
      note: 'Pas disponible en décembre',
    })
  })
})

describe('an archive from before 2.14', () => {
  it('imports the congregations as never sent, and no « Notre liste »', async () => {
    archive({ 'speaker-congregations': [{ id: 3, name: 'Bagnolet', ...contacts, listDate: null, notes: '' }] })
    const db = makeDb()

    await importSpeakerCongregations({} as never, db as never, new EntityIdMap(), 1)
    await importOurSpeakers({} as never, db as never, new EntityIdMap(), 1)

    expect(db.speakerCongregation.create.mock.calls[0]?.[0].data).toMatchObject({
      ourListSentAt: null,
      ourListSentManually: false,
      ourListSentDigest: null,
    })
    expect(db.ourSpeaker.create).not.toHaveBeenCalled()
  })
})
