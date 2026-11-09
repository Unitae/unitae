import { describe, expect, it } from 'vitest'
import { titleFromFileName } from '~/features/display-board/model/file-title'

describe('titleFromFileName', () => {
  it('drops the extension and turns separators into spaces', () => {
    expect(titleFromFileName('lettre_college-central_avril.pdf')).toBe('Lettre college central avril')
  })

  it('keeps accents and capitals as written', () => {
    expect(titleFromFileName('Programme de la Réunion  (nov).PDF')).toBe('Programme de la Réunion (nov)')
  })

  it('gives nothing for a name with nothing in it', () => {
    expect(titleFromFileName('.pdf')).toBe('')
  })
})
