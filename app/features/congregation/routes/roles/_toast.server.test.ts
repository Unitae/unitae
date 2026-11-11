import { describe, expect, it, vi } from 'vitest'

// The session is a stand-in that writes what was flashed into the cookie, so the tests read the toast from the
// response alone.

vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn(async () => {
    const flashed: string[] = []
    return { flashed, flash: (kind: string, message: string) => flashed.push(`${kind}:${message}`) }
  }),
  commitSession: vi.fn(async (session: { flashed: string[] }) => `flash=${session.flashed.join('|')}`),
}))

const { okWithToast } = await import('./_toast.server')

const request = new Request('https://unitae.example.test/congregation/roles/organigram', { method: 'POST' })

describe('okWithToast', () => {
  it('answers ok with the message to show', async () => {
    const result = await okWithToast(request, 'Rôle enregistré.')
    expect(result.data).toEqual({ ok: true })
    expect(new Headers(result.init?.headers).get('Set-Cookie')).toBe('flash=success:Rôle enregistré.')
  })

  it('carries what the page needs next', async () => {
    const result = await okWithToast(request, 'Rôle créé.', { roleId: 42 })
    expect(result.data).toEqual({ ok: true, roleId: 42 })
  })
})
