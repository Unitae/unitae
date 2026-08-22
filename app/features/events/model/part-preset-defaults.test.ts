import { describe, expect, it } from 'vitest'
import { PartPresetKey } from './part-preset.type'
import { partPresetName, partPresetShareMessage } from './part-preset-defaults'

describe('partPresetName', () => {
  it('uses the built-in name when the congregation has not renamed the kind', () => {
    expect(partPresetName({ key: PartPresetKey.BibleReading, name: null })).toBe('Lecture de la Bible')
  })

  it("prefers the congregation's own name once it has one", () => {
    expect(partPresetName({ key: PartPresetKey.BibleReading, name: 'Notre lecture' })).toBe('Notre lecture')
  })

  it('follows the requested locale for a built-in', () => {
    expect(partPresetName({ key: PartPresetKey.BibleReading, name: null }, 'en')).toBe('Bible Reading')
  })

  it('does not translate a name the congregation chose', () => {
    // Their wording is theirs; switching language must not overwrite it.
    expect(partPresetName({ key: PartPresetKey.BibleReading, name: 'Notre lecture' }, 'en')).toBe('Notre lecture')
  })

  it('falls back to the key for a congregation-created kind with no name', () => {
    // Should not happen — the form requires a name — but a bare key beats an
    // empty row in a picker.
    expect(partPresetName({ key: 'discours-de-circonscription', name: null })).toBe('discours-de-circonscription')
  })
})

describe('partPresetShareMessage', () => {
  it('uses the built-in body when the kind carries none', () => {
    expect(partPresetShareMessage({ key: PartPresetKey.Prayer, shareMessage: null }, 'fr')).toContain('Tu as la prière')
  })

  it('follows the locale', () => {
    expect(partPresetShareMessage({ key: PartPresetKey.Prayer, shareMessage: null }, 'en')).toContain(
      'You have the prayer',
    )
  })

  it("prefers the congregation's own wording", () => {
    expect(partPresetShareMessage({ key: PartPresetKey.Prayer, shareMessage: 'Salut !' }, 'fr')).toBe('Salut !')
  })

  it('treats an empty body as a deliberate choice, not as absent', () => {
    // Clearing the message is how a kind opts out of sharing. Falling back to
    // the built-in would override that and send something anyway.
    expect(partPresetShareMessage({ key: PartPresetKey.Prayer, shareMessage: '' }, 'fr')).toBe('')
  })

  it('has no body for a congregation-created kind that never set one', () => {
    expect(partPresetShareMessage({ key: 'custom-kind', shareMessage: null }, 'fr')).toBe('')
  })
})
