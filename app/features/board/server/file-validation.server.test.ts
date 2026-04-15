import { describe, expect, it } from 'vitest'

import { FileValidationError, validateBoardFile, validateVisibilityDates } from './file-validation.server'

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

describe('validateVisibilityDates', () => {
  it('retourne true quand les deux dates sont null', () => {
    expect(validateVisibilityDates(null, null)).toBe(true)
  })

  it('retourne true quand visibleFrom est null', () => {
    expect(validateVisibilityDates(null, new Date('2026-01-01'))).toBe(true)
  })

  it('retourne true quand visibleUntil est null', () => {
    expect(validateVisibilityDates(new Date('2026-01-01'), null)).toBe(true)
  })

  it('retourne true quand visibleUntil est apres visibleFrom', () => {
    const from = new Date('2026-01-01')
    const until = new Date('2026-02-01')
    expect(validateVisibilityDates(from, until)).toBe(true)
  })

  it('retourne false quand visibleUntil est avant visibleFrom', () => {
    const from = new Date('2026-02-01')
    const until = new Date('2026-01-01')
    expect(validateVisibilityDates(from, until)).toBe(false)
  })

  it('retourne false quand les deux dates sont identiques', () => {
    const date = new Date('2026-01-01')
    expect(validateVisibilityDates(date, new Date(date.getTime()))).toBe(false)
  })

  it('retourne true quand une date est invalide (NaN)', () => {
    expect(validateVisibilityDates(new Date('invalid'), new Date('2026-01-01'))).toBe(true)
    expect(validateVisibilityDates(new Date('2026-01-01'), new Date('invalid'))).toBe(true)
  })
})
