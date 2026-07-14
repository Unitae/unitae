import { describe, expect, it, vi } from 'vitest'
import { getLocale } from '~/i18n/paraglide/runtime'
import { formatGroupName } from './format-group-name'

vi.mock('~/i18n/paraglide/runtime', () => ({
  getLocale: vi.fn(),
}))

describe('formatGroupName', () => {
  it('uppercases the name using the current paraglide locale', () => {
    vi.mocked(getLocale).mockReturnValue('fr')
    expect(formatGroupName('Alpha')).toBe('ALPHA')
  })

  it('uppercases French accents correctly under the fr locale', () => {
    vi.mocked(getLocale).mockReturnValue('fr')
    expect(formatGroupName('élise')).toBe('ÉLISE')
  })

  it('leaves an already-uppercase name unchanged', () => {
    vi.mocked(getLocale).mockReturnValue('fr')
    expect(formatGroupName('BETA')).toBe('BETA')
  })

  it('switches casing rules when the paraglide locale changes', () => {
    vi.mocked(getLocale).mockReturnValue('fr')
    const fr = formatGroupName('élise')
    vi.mocked(getLocale).mockReturnValue('en')
    const en = formatGroupName('élise')
    expect(fr).toBe('ÉLISE')
    expect(en).toBe('ÉLISE')
  })
})
