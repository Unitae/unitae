import { describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/file-storage.server', () => ({
  buildStorageKey: (congregationId: number, feature: string, name: string) => `${congregationId}/${feature}/${name}`,
  uploadFile: vi.fn(),
  getFile: vi.fn(),
  deleteFileFromStorage: vi.fn(),
}))

const { SpeakerListFileError, storeSpeakerListPdf } = await import('./speaker-list-file.server')

const STORED_KEY = /^7\/external-speakers\/[\w-]+\.pdf$/

const pdf = (bytes: string, type = 'application/pdf', size?: number) => {
  const file = new File([bytes], 'liste.pdf', { type })
  if (size != null) Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('storeSpeakerListPdf', () => {
  it('stores a PDF under the congregation, in the external-speakers folder', async () => {
    const key = await storeSpeakerListPdf(7, pdf('%PDF-1.7 …'))
    expect(key).toMatch(STORED_KEY)
  })

  it('refuses what is not a PDF, whatever it claims to be', async () => {
    await expect(storeSpeakerListPdf(7, pdf('hello', 'application/pdf'))).rejects.toThrow(SpeakerListFileError)
    await expect(storeSpeakerListPdf(7, pdf('%PDF-1.7', 'image/png'))).rejects.toThrow(SpeakerListFileError)
  })

  it('refuses a file over 10 MB', async () => {
    await expect(storeSpeakerListPdf(7, pdf('%PDF-1.7', 'application/pdf', 11 * 1024 * 1024))).rejects.toThrow(
      SpeakerListFileError,
    )
  })
})
