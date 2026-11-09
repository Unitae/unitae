import { describe, expect, it } from 'vitest'

import { FileValidationError, MAX_FILE_SIZE_BYTES, validateBoardFile } from './file-validation.server'

function createFakeFile(content: Uint8Array, type: string, name = 'test.pdf'): File {
  return new File([content as BlobPart], name, { type })
}

const validPdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) // %PDF-1.4

describe('validateBoardFile', () => {
  it('accepte un fichier PDF valide', async () => {
    const file = createFakeFile(validPdfHeader, 'application/pdf')
    await expect(validateBoardFile(file)).resolves.toBeUndefined()
  })

  it('rejette un fichier avec un type MIME non autorise', async () => {
    const file = createFakeFile(validPdfHeader, 'image/png', 'image.png')
    await expect(validateBoardFile(file)).rejects.toThrow(FileValidationError)
    await expect(validateBoardFile(file)).rejects.toThrow('invalid_type')
  })

  it('rejette un fichier trop volumineux', async () => {
    const largeContent = new Uint8Array(21 * 1024 * 1024)
    largeContent.set(validPdfHeader)
    const file = createFakeFile(largeContent, 'application/pdf')
    await expect(validateBoardFile(file)).rejects.toThrow(FileValidationError)
    await expect(validateBoardFile(file)).rejects.toThrow('file_too_large')
  })

  it('accepte un fichier juste en dessous de la limite de taille', async () => {
    const content = new Uint8Array(MAX_FILE_SIZE_BYTES)
    content.set(validPdfHeader)
    const file = createFakeFile(content, 'application/pdf')
    await expect(validateBoardFile(file)).resolves.toBeUndefined()
  })

  it('rejette un fichier depassant la limite de 1 octet', async () => {
    const content = new Uint8Array(MAX_FILE_SIZE_BYTES + 1)
    content.set(validPdfHeader)
    const file = createFakeFile(content, 'application/pdf')
    await expect(validateBoardFile(file)).rejects.toThrow('file_too_large')
  })

  it('rejette un fichier PDF avec des magic bytes incorrects', async () => {
    const fakeContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]) // PNG header
    const file = createFakeFile(fakeContent, 'application/pdf')
    await expect(validateBoardFile(file)).rejects.toThrow(FileValidationError)
    await expect(validateBoardFile(file)).rejects.toThrow('invalid_content')
  })

  it('rejette un fichier vide', async () => {
    const file = createFakeFile(new Uint8Array(0), 'application/pdf')
    await expect(validateBoardFile(file)).rejects.toThrow(FileValidationError)
    await expect(validateBoardFile(file)).rejects.toThrow('invalid_content')
  })
})

describe('MAX_FILE_SIZE_BYTES', () => {
  it('vaut 20 Mo', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(20 * 1024 * 1024)
  })
})
