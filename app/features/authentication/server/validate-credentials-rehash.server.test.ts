import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compare } from '~/shared/auth/crypto.server'

// End-to-end coverage of the rehash-on-login upgrade using the REAL crypto module (not mocked):
// a genuine legacy `salt.key` hash must, on a successful login, be rewritten to a valid
// current-format hash that still verifies the same password. The other unit test file mocks
// crypto entirely and only proves the wiring; this one proves the actual upgrade is correct.
// Only the DB boundary is mocked, so the write target can be captured and re-verified.
vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: { findFirst: vi.fn(), update: vi.fn() },
  },
}))

const { validateCredentials } = await import('./validate-credentials.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

// A real hash of LEGACY_PASSWORD at Node's historical defaults (N=2^14), in the pre-#293
// `salt.key` format — the exact shape existing production rows carry.
const LEGACY_PASSWORD = 'legacy-motdepasse'
const LEGACY_HASH = 'a3f1c9e0b7d24856a3f1c9e0b7d24856.fbdad3fb7081fb3a92dcfd0f2e0f9db1eaa46c6236e66df897f1e7d8bbf258f7'

// These cases drive REAL scrypt at N=2^17 (several derivations each, since the rehash path
// hashes and then re-verifies). Vitest's 5s default leaves no headroom on a loaded runner —
// see the same constant in `crypto.server.test.ts`.
const SCRYPT_TIMEOUT_MS = 60_000

beforeEach(() => {
  vi.resetAllMocks()
})

describe(
  'validateCredentials — rehash-on-login (crypto réel)',
  () => {
    it('met à niveau un hash hérité vers le format courant, réhash qui vérifie toujours le mot de passe', async () => {
      vi.mocked(db.userAccount.findFirst).mockResolvedValue({
        id: 7,
        email: 'legacy@example.com',
        password: LEGACY_HASH,
        active: true,
      } as never)

      const result = await validateCredentials('legacy@example.com', LEGACY_PASSWORD)
      expect(result).toBe(7)

      // The upgrade write happened exactly once with a current-format hash…
      expect(db.userAccount.update).toHaveBeenCalledTimes(1)
      const written = vi.mocked(db.userAccount.update).mock.calls[0][0].data.password as string
      expect(written.startsWith('scrypt$131072$8$1$')).toBe(true)

      // …and the rewritten hash still verifies the same password (not a corrupt value).
      await expect(compare(LEGACY_PASSWORD, written)).resolves.toBe(true)
      await expect(compare('mauvais', written)).resolves.toBe(false)
    })

    it('ne met pas à niveau (aucune écriture) quand le hash stocké est déjà au format courant', async () => {
      const { hash } = await import('~/shared/auth/crypto.server')
      const currentHash = await hash(LEGACY_PASSWORD)

      vi.mocked(db.userAccount.findFirst).mockResolvedValue({
        id: 8,
        email: 'current@example.com',
        password: currentHash,
        active: true,
      } as never)

      const result = await validateCredentials('current@example.com', LEGACY_PASSWORD)
      expect(result).toBe(8)
      expect(db.userAccount.update).not.toHaveBeenCalled()
    })
  },
  SCRYPT_TIMEOUT_MS,
)
