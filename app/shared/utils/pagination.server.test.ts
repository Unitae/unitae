import { describe, expect, it } from 'vitest'
import { paginationFromUrl } from './pagination.server'

describe('paginationFromUrl', () => {
  it('retourne les valeurs par défaut sans paramètres', () => {
    const url = new URL('http://localhost/')
    const result = paginationFromUrl(url, 100)

    expect(result.page).toBe(1)
    expect(result.size).toBe(25)
    expect(result.offset).toBe(0)
    expect(result.total).toBe(100)
    expect(result.pages).toBe(4)
    expect(result.previous).toBeNull()
    expect(result.next).toBe(2)
  })

  it("utilise les paramètres page et pageSize de l'URL", () => {
    const url = new URL('http://localhost/?page=3&pageSize=10')
    const result = paginationFromUrl(url, 50)

    expect(result.page).toBe(3)
    expect(result.size).toBe(10)
    expect(result.offset).toBe(20)
    expect(result.total).toBe(50)
    expect(result.pages).toBe(5)
  })

  it('retourne previous null sur la première page', () => {
    const url = new URL('http://localhost/?page=1')
    const result = paginationFromUrl(url, 50)

    expect(result.previous).toBeNull()
  })

  it('retourne previous quand page > 1', () => {
    const url = new URL('http://localhost/?page=3')
    const result = paginationFromUrl(url, 100)

    expect(result.previous).toBe(2)
  })

  it('retourne next null sur la dernière page', () => {
    const url = new URL('http://localhost/?page=4&pageSize=25')
    const result = paginationFromUrl(url, 100)

    expect(result.next).toBeNull()
  })

  it('retourne next quand il y a des pages suivantes', () => {
    const url = new URL('http://localhost/?page=1&pageSize=25')
    const result = paginationFromUrl(url, 100)

    expect(result.next).toBe(2)
  })

  it('gère count=0 correctement', () => {
    const url = new URL('http://localhost/')
    const result = paginationFromUrl(url, 0)

    expect(result.total).toBe(0)
    expect(result.pages).toBe(0)
    expect(result.previous).toBeNull()
    expect(result.next).toBeNull()
  })

  it('gère la division exacte des pages', () => {
    const url = new URL('http://localhost/?pageSize=10')
    const result = paginationFromUrl(url, 30)

    expect(result.pages).toBe(3)
  })

  it('arrondit au supérieur pour les pages partielles', () => {
    const url = new URL('http://localhost/?pageSize=10')
    const result = paginationFromUrl(url, 31)

    expect(result.pages).toBe(4)
  })

  it("calcule l'offset correctement", () => {
    const url = new URL('http://localhost/?page=5&pageSize=20')
    const result = paginationFromUrl(url, 200)

    expect(result.offset).toBe(80)
  })
})
