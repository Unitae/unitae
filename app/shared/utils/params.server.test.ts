import { describe, expect, it } from 'vitest'
import { requireParamId } from './params.server'

describe('requireParamId', () => {
  it('retourne le nombre pour un string numérique valide', () => {
    expect(requireParamId('42')).toBe(42)
  })

  it('retourne 0 pour "0"', () => {
    expect(requireParamId('0')).toBe(0)
  })

  it('lance une redirection pour undefined', () => {
    try {
      requireParamId(undefined)
      expect.unreachable('devrait lancer une redirection')
    } catch (thrown) {
      const response = thrown as Response
      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe('/')
    }
  })

  it('lance une redirection pour un string non-numérique', () => {
    try {
      requireParamId('abc')
      expect.unreachable('devrait lancer une redirection')
    } catch (thrown) {
      const response = thrown as Response
      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe('/')
    }
  })

  it('utilise le redirectTo personnalisé', () => {
    try {
      requireParamId('abc', '/territoires')
      expect.unreachable('devrait lancer une redirection')
    } catch (thrown) {
      const response = thrown as Response
      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe('/territoires')
    }
  })

  it('gère les nombres négatifs', () => {
    expect(requireParamId('-1')).toBe(-1)
  })

  it('gère les nombres décimaux (Number les accepte)', () => {
    expect(requireParamId('3.14')).toBe(3.14)
  })
})
