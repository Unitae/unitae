import { beforeEach, describe, expect, it, vi } from 'vitest'

// The import and export page's form: each intent needs its own right, an archive is only ever one the server minted
// in the congregation's folder, and an upload that is not an archive is refused before anything is read. Queued jobs
// and stored files are recorded in memory.

const { queued, uploaded, validation } = vi.hoisted(() => ({
  queued: [] as { name: string; data: Record<string, unknown> }[],
  uploaded: [] as string[],
  validation: { fails: false },
}))

vi.mock('~/features/settings/server/data-transfer-queue.server', () => ({
  dataTransferQueue: {
    add: vi.fn(async (name: string, data: Record<string, unknown>) => {
      queued.push({ name, data })
      return { id: 'job-1' }
    }),
  },
}))
vi.mock('~/features/settings/server/import-congregation.server', () => ({
  validateImport: vi.fn(async () => {
    if (validation.fails) throw new Error('broken archive')
  }),
}))
vi.mock('~/shared/infra/file-storage.server', () => ({
  buildStorageKey: (congregationId: number, feature: string, filename: string) =>
    `${congregationId}/${feature}/${filename}`,
  uploadFile: vi.fn(async (key: string) => {
    uploaded.push(key)
  }),
}))
vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn(async () => ({ flash: vi.fn() })),
  commitSession: vi.fn(async () => 'flash=1'),
}))

const { handleDataAction, importStorageKey } = await import('./_data-action.server')

const URL = 'https://unitae.example.test/settings/data'
const ARCHIVE = '6f1c2b0e-8d4a-4e8b-9c3f-1a2b3c4d5e6f'
const UPLOADED_KEY = /^1\/imports\/[0-9a-f-]{36}\.unitae$/
const ADMIN = { id: 7, congregationId: 1, canExport: true, canImport: true }
const EXPORTER = { id: 8, congregationId: 1, canExport: true, canImport: false }

async function settle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run()
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    throw thrown
  }
}

const post = (fields: Record<string, string>) => new Request(URL, { method: 'POST', body: new URLSearchParams(fields) })

function upload(name: string): Request {
  const body = new FormData()
  body.set('archive', new File([new Uint8Array([80, 75, 3, 4])], name, { type: 'application/zip' }))
  return new Request(URL, { method: 'POST', body })
}

beforeEach(() => {
  queued.length = 0
  uploaded.length = 0
  validation.fails = false
})

describe('handleDataAction', () => {
  it('starts an export with the chosen content and follows its progress', async () => {
    const response = await settle(() => handleDataAction(post({ intent: 'export', includeFiles: 'on' }), EXPORTER))
    expect(queued).toEqual([
      {
        name: 'export',
        data: {
          type: 'export',
          congregationId: 1,
          userId: 8,
          options: { includeFiles: true, includeAuditLogs: false },
        },
      },
    ])
    expect(response.headers.get('Location')).toBe('/settings/data?export=job-1')
  })

  it('starts no export for a caller who cannot export', async () => {
    const response = await settle(() => handleDataAction(post({ intent: 'export' }), { ...ADMIN, canExport: false }))
    expect(queued).toEqual([])
    expect(response.headers.get('Location')).toBe('/settings/data')
  })

  it('starts the import of an archive the congregation uploaded', async () => {
    const response = await settle(() => handleDataAction(post({ intent: 'confirm-import', archive: ARCHIVE }), ADMIN))
    expect(queued.map(job => job.data.storageKey)).toEqual([`1/imports/${ARCHIVE}.unitae`])
    expect(response.headers.get('Location')).toBe('/settings/data?importJob=job-1')
  })

  it('starts no import for a caller who cannot import', async () => {
    await settle(() => handleDataAction(post({ intent: 'confirm-import', archive: ARCHIVE }), EXPORTER))
    expect(queued).toEqual([])
  })

  it('reads no upload from a caller who cannot import', async () => {
    const response = await settle(() => handleDataAction(upload('backup.unitae'), EXPORTER))
    expect(uploaded).toEqual([])
    expect(response.headers.get('Location')).toBe('/settings/data')
  })

  it('keeps an uploaded archive and opens the page on what it holds', async () => {
    const response = await settle(() => handleDataAction(upload('backup.unitae'), ADMIN))
    expect(uploaded).toHaveLength(1)
    expect(uploaded[0]).toMatch(UPLOADED_KEY)
    const archive = uploaded[0]?.slice('1/imports/'.length, -'.unitae'.length)
    expect(response.headers.get('Location')).toBe(`/settings/data?import=${archive}`)
  })

  it('refuses a file that is not an archive, and one that cannot be read', async () => {
    const notArchive = await settle(() => handleDataAction(upload('backup.zip'), ADMIN))
    expect(uploaded).toEqual([])
    expect(notArchive.headers.get('Location')).toBe('/settings/data')

    validation.fails = true
    const broken = await settle(() => handleDataAction(upload('backup.unitae'), ADMIN))
    expect(broken.headers.get('Location')).toBe('/settings/data')
  })
})

describe('importStorageKey', () => {
  it('keeps an archive id inside the congregation’s folder', () => {
    expect(importStorageKey(1, ARCHIVE)).toBe(`1/imports/${ARCHIVE}.unitae`)
  })

  it('refuses anything but an id the server mints', () => {
    expect(importStorageKey(1, null)).toBeNull()
    expect(importStorageKey(1, '../2/imports/x')).toBeNull()
    expect(importStorageKey(1, `${ARCHIVE}/..`)).toBeNull()
  })
})
