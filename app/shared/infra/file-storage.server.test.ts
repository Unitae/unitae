import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Force local driver (no S3_ENDPOINT)
delete process.env.S3_ENDPOINT

let testDir: string
// Files intentionally created OUTSIDE testDir (to prove containment) — tracked
// so afterAll removes them and nothing leaks into the shared temp dir.
const outsidePaths: string[] = []

beforeAll(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'unitae-storage-test-'))
  process.env.UNITAE_STORAGE_PATH = testDir
})

afterAll(async () => {
  for (const outside of outsidePaths) {
    await fs.rm(outside, { force: true })
  }
  await fs.rm(testDir, { recursive: true, force: true })
  delete process.env.UNITAE_STORAGE_PATH
})

beforeEach(() => {
  vi.resetModules()
})

async function getModule() {
  return await import('./file-storage.server')
}

describe('local filesystem driver', () => {
  describe('uploadFile + getFileBuffer (aller-retour)', () => {
    it('écrit et relit un fichier correctement', async () => {
      const { uploadFile, getFileBuffer } = await getModule()
      const content = Buffer.from('Contenu du fichier PDF')

      await uploadFile('1/board/test.pdf', content, 'application/pdf')
      const result = await getFileBuffer('1/board/test.pdf')

      expect(result).not.toBeNull()
      expect(result?.toString()).toBe('Contenu du fichier PDF')
    })

    it('crée les répertoires intermédiaires automatiquement', async () => {
      const { uploadFile } = await getModule()

      await uploadFile('99/deep/nested/file.txt', Buffer.from('ok'), 'text/plain')

      const filePath = path.join(testDir, '99/deep/nested/file.txt')
      const stat = await fs.stat(filePath)
      expect(stat.isFile()).toBe(true)
    })
  })

  describe('getFile', () => {
    it('retourne le body et le contentType', async () => {
      const { uploadFile, getFile } = await getModule()
      await uploadFile('1/board/stream.pdf', Buffer.from('stream-data'), 'application/pdf')

      const result = await getFile('1/board/stream.pdf')

      expect(result).not.toBeNull()
      expect(result?.contentType).toBe('application/pdf')
    })

    it('retourne null pour un fichier inexistant', async () => {
      const { getFile } = await getModule()

      const result = await getFile('inexistant/fichier.pdf')
      expect(result).toBeNull()
    })
  })

  describe('getFileBuffer', () => {
    it('retourne null pour un fichier inexistant', async () => {
      const { getFileBuffer } = await getModule()

      const result = await getFileBuffer('inexistant/fichier.pdf')
      expect(result).toBeNull()
    })
  })

  describe('deleteFileFromStorage', () => {
    it('supprime un fichier existant', async () => {
      const { uploadFile, deleteFileFromStorage, getFileBuffer } = await getModule()
      await uploadFile('1/board/to-delete.pdf', Buffer.from('à supprimer'), 'application/pdf')

      await deleteFileFromStorage('1/board/to-delete.pdf')

      const result = await getFileBuffer('1/board/to-delete.pdf')
      expect(result).toBeNull()
    })

    it("ne lance pas d'erreur pour un fichier inexistant", async () => {
      const { deleteFileFromStorage } = await getModule()

      await expect(deleteFileFromStorage('inexistant/fichier.pdf')).resolves.toBeUndefined()
    })
  })

  describe('buildStorageKey', () => {
    it('construit la clé au format congregationId/feature/filename', async () => {
      const { buildStorageKey } = await getModule()

      expect(buildStorageKey(5, 'board', 'abc.pdf')).toBe('5/board/abc.pdf')
    })
  })

  describe('path traversal containment', () => {
    it('rejects an upload whose key escapes the storage root and writes nothing outside', async () => {
      const { uploadFile, StorageKeyError } = await getModule()
      const escapeName = `pwned-${process.pid}.txt`
      const escapePath = path.join(testDir, '..', escapeName)
      outsidePaths.push(escapePath)

      await expect(uploadFile(`../${escapeName}`, Buffer.from('nope'), 'text/plain')).rejects.toBeInstanceOf(
        StorageKeyError,
      )
      // The escape target outside the root must not have been written.
      await expect(fs.access(escapePath)).rejects.toThrow()
    })

    it('rejects an absolute key that escapes the storage root', async () => {
      const { uploadFile } = await getModule()
      const absoluteKey = path.join(os.tmpdir(), `unitae-pwned-${process.pid}.txt`)
      outsidePaths.push(absoluteKey)

      await expect(uploadFile(absoluteKey, Buffer.from('nope'), 'text/plain')).rejects.toThrow()
      await expect(fs.access(absoluteKey)).rejects.toThrow()
    })

    it('rejects a sibling directory that shares the root prefix', async () => {
      // Guards the load-bearing `+ path.sep`: `${ROOT}-evil` must NOT pass a
      // naive startsWith(ROOT) check.
      const { uploadFile } = await getModule()
      const siblingKey = `../${path.basename(testDir)}-evil/x.txt`
      outsidePaths.push(path.resolve(testDir, siblingKey))

      await expect(uploadFile(siblingKey, Buffer.from('nope'), 'text/plain')).rejects.toThrow()
    })

    it('does not read a real file outside the root via traversal', async () => {
      const { getFileBuffer } = await getModule()
      // Seed a sentinel at the exact path the traversal key resolves to, so a
      // null result proves containment rather than a coincidental ENOENT.
      const sentinelName = `sentinel-${process.pid}.txt`
      const sentinelPath = path.join(testDir, '..', sentinelName)
      await fs.writeFile(sentinelPath, 'TOP-SECRET')
      outsidePaths.push(sentinelPath)

      // With the guard removed this would return Buffer('TOP-SECRET').
      const result = await getFileBuffer(`../${sentinelName}`)
      expect(result).toBeNull()
    })

    it('still round-trips a legitimate nested key', async () => {
      const { uploadFile, getFileBuffer } = await getModule()

      await uploadFile('42/imports/abc.unitae', Buffer.from('archive'), 'application/zip')
      const result = await getFileBuffer('42/imports/abc.unitae')

      expect(result?.toString()).toBe('archive')
    })
  })
})
