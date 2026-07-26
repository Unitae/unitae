import { describe, expect, it } from 'vitest'
import { isOwnedImportKey } from './import-storage-key.server'

describe('isOwnedImportKey', () => {
  it('accepts a key with the caller congregation prefix, imports segment and .unitae extension', () => {
    expect(isOwnedImportKey(42, '42/imports/1f0a2b3c-4d5e-6f70-8a9b-0c1d2e3f4a5b.unitae')).toBe(true)
  })

  it('rejects a key belonging to another congregation', () => {
    expect(isOwnedImportKey(42, '7/imports/1f0a2b3c-4d5e-6f70-8a9b-0c1d2e3f4a5b.unitae')).toBe(false)
  })

  it('rejects a prefix-confusion key where the id merely starts with the caller id', () => {
    // "420" must not pass for congregation 42 — the anchored ^ guards this.
    expect(isOwnedImportKey(42, '420/imports/1f0a2b3c-4d5e-6f70-8a9b-0c1d2e3f4a5b.unitae')).toBe(false)
  })

  it('rejects path traversal segments', () => {
    expect(isOwnedImportKey(42, '../../etc/passwd')).toBe(false)
    expect(isOwnedImportKey(42, '42/imports/../../../etc/passwd.unitae')).toBe(false)
  })

  it('rejects an absolute path', () => {
    expect(isOwnedImportKey(42, '/etc/passwd')).toBe(false)
  })

  it('rejects a key from another feature bucket', () => {
    expect(isOwnedImportKey(42, '42/exports/1f0a2b3c-4d5e-6f70-8a9b-0c1d2e3f4a5b.unitae')).toBe(false)
  })

  it('rejects a key with the wrong extension', () => {
    expect(isOwnedImportKey(42, '42/imports/1f0a2b3c-4d5e-6f70-8a9b-0c1d2e3f4a5b.zip')).toBe(false)
  })

  it('rejects a key with an empty filename', () => {
    expect(isOwnedImportKey(42, '42/imports/.unitae')).toBe(false)
  })

  it('rejects trailing content after the extension', () => {
    expect(isOwnedImportKey(42, '42/imports/1f0a2b3c-4d5e-6f70-8a9b-0c1d2e3f4a5b.unitae/x')).toBe(false)
  })

  // Subtle bypass classes — all rejected today. These pin the properties a
  // future charset/anchor change could silently reopen.
  it('rejects newline injection past the anchor', () => {
    // JS `$` (no `m` flag) anchors to end-of-input, so a trailing newline +
    // payload must not slip through.
    expect(isOwnedImportKey(42, '42/imports/1f0a2b3c-4d5e-6f70-8a9b-0c1d2e3f4a5b.unitae\n../../etc/passwd')).toBe(false)
  })

  it('rejects a poison null byte in the filename', () => {
    expect(isOwnedImportKey(42, '42/imports/1f0a2b3c-4d5e-6f70-8a9b-0c1d2e3f4a5b.unitae\0.png')).toBe(false)
  })

  it('rejects backslash separators', () => {
    expect(isOwnedImportKey(42, '42\\imports\\1f0a2b3c-4d5e-6f70-8a9b-0c1d2e3f4a5b.unitae')).toBe(false)
  })

  it('rejects surrounding whitespace', () => {
    expect(isOwnedImportKey(42, ' 42/imports/1f0a2b3c-4d5e-6f70-8a9b-0c1d2e3f4a5b.unitae ')).toBe(false)
  })

  it('rejects uppercase hex (keys are minted lowercase)', () => {
    expect(isOwnedImportKey(42, '42/imports/1F0A2B3C-4D5E-6F70-8A9B-0C1D2E3F4A5B.unitae')).toBe(false)
  })
})
