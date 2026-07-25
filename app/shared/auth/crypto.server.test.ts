import { describe, expect, it } from 'vitest'
import { compare, hash, hashToken } from './crypto.server'

const HEX_PATTERN = /^[0-9a-f]+$/

describe('hashToken', () => {
  it('produit un digest SHA-256 hex de 64 caractères', () => {
    const digest = hashToken('un-token-quelconque')

    expect(digest).toMatch(HEX_PATTERN)
    expect(digest).toHaveLength(64)
  })

  it('est déterministe (même entrée → même digest, pour permettre la recherche par index)', () => {
    expect(hashToken('token-abc')).toBe(hashToken('token-abc'))
  })

  it('produit des digests différents pour des tokens différents', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'))
  })

  it('ne renvoie jamais le token en clair', () => {
    const raw = 'token-en-clair'
    expect(hashToken(raw)).not.toBe(raw)
  })
})

describe('hash', () => {
  it('retourne un hash au format salt.key', async () => {
    const result = await hash('motdepasse')
    const parts = result.split('.')

    expect(parts).toHaveLength(2)
    expect(parts[0]).toMatch(HEX_PATTERN)
    expect(parts[1]).toMatch(HEX_PATTERN)
  })

  it('produit des résultats différents pour le même mot de passe (sel aléatoire)', async () => {
    const hash1 = await hash('motdepasse')
    const hash2 = await hash('motdepasse')

    expect(hash1).not.toBe(hash2)
  })
})

describe('compare', () => {
  it('retourne true pour le bon mot de passe', async () => {
    const hashed = await hash('motdepasse')
    const result = await compare('motdepasse', hashed)

    expect(result).toBe(true)
  })

  it('retourne false pour un mauvais mot de passe', async () => {
    const hashed = await hash('motdepasse')
    const result = await compare('mauvais', hashed)

    expect(result).toBe(false)
  })

  it('rejette un format de hash invalide (sans point)', async () => {
    await expect(compare('motdepasse', 'formatsansseparateur')).rejects.toThrow('Invalid format')
  })

  it('rejette un hash vide', async () => {
    await expect(compare('motdepasse', '')).rejects.toThrow('Invalid format')
  })

  it('fonctionne en aller-retour pour différents mots de passe', async () => {
    const passwords = ['simple', 'Compl3x!@#', '日本語', '  espaces  ', 'a']

    for (const password of passwords) {
      const hashed = await hash(password)
      const result = await compare(password, hashed)
      expect(result).toBe(true)
    }
  })
})
