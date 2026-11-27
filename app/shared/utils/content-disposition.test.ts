import { describe, expect, it } from 'vitest'

import { contentDisposition } from './content-disposition'

const INLINE_RE = /^inline; filename="liste.pdf"/

describe('contentDisposition', () => {
  // A header only carries Latin-1: « Cœur » or « Олег » made new Response() throw, after the render, as a bare 500.
  it('names the file in UTF-8, with a plain ASCII name for older clients', () => {
    const header = contentDisposition('S-89_F-Олег Cœur.pdf')

    expect(() => new Headers({ 'Content-Disposition': header })).not.toThrow()
    expect(header).toBe(
      `attachment; filename="S-89_F-____ Coeur.pdf"; filename*=UTF-8''S-89_F-%D0%9E%D0%BB%D0%B5%D0%B3%20C%C5%93ur.pdf`,
    )
  })

  it('keeps the accents of the ASCII name as their bare letter', () => {
    expect(contentDisposition('Jérôme.pdf')).toContain('filename="Jerome.pdf"')
  })

  it('shows a file in place when asked to', () => {
    expect(contentDisposition('liste.pdf', 'inline')).toMatch(INLINE_RE)
  })
})
