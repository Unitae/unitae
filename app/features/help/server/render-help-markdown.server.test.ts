import { describe, expect, it } from 'vitest'
import { renderHelpMarkdown } from '~/features/help/server/render-help-markdown.server'

const ENLARGE_FR = /<button type="button" data-help-capture aria-label="Agrandir : Le bouton"[^>]*><img /
const ENLARGE_EN = /<button type="button" data-help-capture aria-label="Enlarge: The button"[^>]*><img /

const CAPTURES = {
  locale: 'fr' as const,
  captures: { 'absences-new': { width: 320, height: 120, captured: '2026-11-17' } },
}

describe('renderHelpMarkdown', () => {
  it('renders headings, numbered steps and emphasis', () => {
    const html = renderHelpMarkdown('## Étapes\n\n1. Cliquez sur **« Nouvelle absence »**.\n')

    expect(html).toContain('<h2>Étapes</h2>')
    expect(html).toContain('<ol>')
    expect(html).toContain('<strong>« Nouvelle absence »</strong>')
  })

  it('escapes raw HTML instead of rendering it', () => {
    const html = renderHelpMarkdown('Avant <script>alert(1)</script> après <img src=x onerror=alert(1)>')

    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;')
  })

  it('shows escaped HTML as the text it was, attributes included, so nothing of the source is lost', () => {
    const html = renderHelpMarkdown('Écrivez <b>gras</b> et <img src=x onerror=alert(1)>')

    expect(html).toContain('&lt;b&gt;gras&lt;/b&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('keeps a link inside the app in the same tab', () => {
    const html = renderHelpMarkdown('[Mes absences](/me/days-off)')

    expect(html).toBe('<p><a href="/me/days-off">Mes absences</a></p>\n')
  })

  it('never makes a javascript: address into a link', () => {
    const html = renderHelpMarkdown('[cliquer](javascript:alert(1))')

    expect(html).not.toContain('<a ')
    expect(html).not.toContain('href="javascript')
  })

  it('draws a capture in both themes, at its size, loaded only when shown', () => {
    const html = renderHelpMarkdown('![Le bouton « Nouvelle absence »](capture:absences-new)', CAPTURES)

    expect(html).toContain(
      '<img src="/help-captures/fr/absences-new.webp?v=2026-11-17" alt="Le bouton « Nouvelle absence »" width="320" height="120" loading="lazy" decoding="async" class="dark:hidden">',
    )
    expect(html).toContain(
      '<img src="/help-captures/fr/absences-new.dark.webp?v=2026-11-17" alt="Le bouton « Nouvelle absence »" width="320" height="120" loading="lazy" decoding="async" class="hidden dark:block">',
    )
  })

  it('wraps a capture in a button that enlarges it, named in the article’s language', () => {
    const fr = renderHelpMarkdown('![Le bouton](capture:absences-new)', CAPTURES)
    const en = renderHelpMarkdown('![The button](capture:absences-new)', {
      locale: 'en',
      captures: CAPTURES.captures,
    })

    expect(fr).toMatch(ENLARGE_FR)
    expect(fr).toContain('</button>')
    expect(en).toMatch(ENLARGE_EN)
  })

  it('escapes the alt text of a capture', () => {
    const html = renderHelpMarkdown('![Un "titre" & <b>](capture:absences-new)', CAPTURES)

    expect(html).toContain('alt="Un &quot;titre&quot; &amp; &lt;b&gt;"')
  })

  it('draws no image for any other source, nor for a capture the language does not have', () => {
    expect(renderHelpMarkdown('![Logo](https://example.org/logo.png)', CAPTURES)).not.toContain('<img')
    expect(renderHelpMarkdown('![Logo](/icon.png)', CAPTURES)).not.toContain('<img')
    expect(renderHelpMarkdown('![Inconnu](capture:unknown)', CAPTURES)).not.toContain('<img')
  })

  it('keeps links to the app and to GitHub, opening external ones in a new tab safely', () => {
    const html = renderHelpMarkdown('[Mes absences](/me/days-off) et [GitHub](https://github.com/Unitae/unitae/issues)')

    expect(html).toContain('href="/me/days-off"')
    expect(html).toContain('href="https://github.com/Unitae/unitae/issues"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})
