import { describe, expect, it } from 'vitest'
import { compare, hash, hashToken, needsRehash } from './crypto.server'

const HEX_PATTERN = /^[0-9a-f]+$/

// A hash produced with Node's historical scrypt defaults (N=2^14) in the pre-#293 `salt.key`
// format. Kept as a frozen fixture so `compare` must keep verifying legacy hashes even after
// new hashes moved to N=2^17 — otherwise every existing user would be locked out.
const LEGACY_PASSWORD = 'legacy-motdepasse'
const LEGACY_HASH = 'a3f1c9e0b7d24856a3f1c9e0b7d24856.fbdad3fb7081fb3a92dcfd0f2e0f9db1eaa46c6236e66df897f1e7d8bbf258f7'

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
  it('retourne un hash auto-descriptif scrypt$N$r$p$sel$clé (N=2^17)', async () => {
    const result = await hash('motdepasse')
    const [scheme, n, r, p, salt, key] = result.split('$')

    expect(scheme).toBe('scrypt')
    expect(n).toBe(String(2 ** 17))
    expect(r).toBe('8')
    expect(p).toBe('1')
    expect(salt).toMatch(HEX_PATTERN)
    expect(salt).toHaveLength(32)
    expect(key).toMatch(HEX_PATTERN)
    expect(key).toHaveLength(64)
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

  it('vérifie un hash hérité au format salt.key (N=2^14) — pas de verrouillage des comptes existants', async () => {
    await expect(compare(LEGACY_PASSWORD, LEGACY_HASH)).resolves.toBe(true)
    await expect(compare('mauvais', LEGACY_HASH)).resolves.toBe(false)
  })

  it('rejette un format de hash invalide (sans séparateur)', async () => {
    await expect(compare('motdepasse', 'formatsansseparateur')).rejects.toThrow('Invalid format')
  })

  it('rejette le sentinel des comptes importés ($IMPORTED$)', async () => {
    await expect(compare('motdepasse', '$IMPORTED$')).rejects.toThrow('Invalid format')
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

describe('needsRehash', () => {
  it('renvoie true pour un hash hérité (N=2^14, format salt.key)', () => {
    expect(needsRehash(LEGACY_HASH)).toBe(true)
  })

  it('renvoie false pour un hash produit avec les paramètres courants', async () => {
    const hashed = await hash('motdepasse')
    expect(needsRehash(hashed)).toBe(false)
  })

  it('renvoie false pour une entrée non analysable (rien à mettre à niveau)', () => {
    expect(needsRehash('$IMPORTED$')).toBe(false)
    expect(needsRehash('')).toBe(false)
  })
})
