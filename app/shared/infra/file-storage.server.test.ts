import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Force local driver (no S3_ENDPOINT)
delete process.env.S3_ENDPOINT

let testDir: string

beforeAll(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'unitae-storage-test-'))
  process.env.UNITAE_STORAGE_PATH = testDir
})

afterAll(async () => {
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
})
