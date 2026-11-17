import { describe, expect, it } from 'vitest'
import { renderHelpMarkdown } from '~/features/help/server/render-help-markdown.server'

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

  it('never makes a javascript: address into a link', () => {
    const html = renderHelpMarkdown('[cliquer](javascript:alert(1))')

    expect(html).not.toContain('<a ')
    expect(html).not.toContain('href="javascript')
  })

  it('keeps links to the app and to GitHub, opening external ones in a new tab safely', () => {
    const html = renderHelpMarkdown('[Mes absences](/me/days-off) et [GitHub](https://github.com/Unitae/unitae/issues)')

    expect(html).toContain('href="/me/days-off"')
    expect(html).toContain('href="https://github.com/Unitae/unitae/issues"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})
