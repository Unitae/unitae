import { describe, expect, it } from 'vitest'
import { helpCaptureUrl, helpImagesIn, withoutImageSources } from '~/features/help/model/help-captures'

describe('helpImagesIn', () => {
  it('lists the images of a body, with their alt text and source, in order', () => {
    const body = 'Texte.\n\n![Le bouton « Nouvelle absence »](capture:absences-new)\n\n![](https://example.org/a.png)'

    expect(helpImagesIn(body)).toEqual([
      { alt: 'Le bouton « Nouvelle absence »', src: 'capture:absences-new' },
      { alt: '', src: 'https://example.org/a.png' },
    ])
  })

  it('does not take a link for an image', () => {
    expect(helpImagesIn('[Mes absences](/me/days-off)')).toEqual([])
  })
})

describe('helpCaptureUrl', () => {
  it('serves each theme of a capture from the language folder, keyed by its date for caches', () => {
    expect(helpCaptureUrl('fr', 'absences-new', 'light', '2026-11-17')).toBe(
      '/help-captures/fr/absences-new.webp?v=2026-11-17',
    )
    expect(helpCaptureUrl('en', 'absences-new', 'dark', '2026-11-17')).toBe(
      '/help-captures/en/absences-new.dark.webp?v=2026-11-17',
    )
  })
})

// The search reads the body as written: an image's source would make « capture » match every illustrated article.
describe('withoutImageSources', () => {
  it('keeps an image’s alt text and drops its source', () => {
    expect(withoutImageSources('Avant ![Le bouton](capture:absences-new) après')).toBe('Avant Le bouton après')
  })
})
