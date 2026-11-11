import { describe, expect, it, vi } from 'vitest'

// The session is a stand-in that writes what was flashed into the cookie, so the tests read the toast the layout
// will show from the response alone.

vi.mock('~/features/authentication/index.server', () => {
  return {
    getSession: vi.fn(async () => {
      const flashed: string[] = []
      return { flashed, flash: (kind: string, message: string) => flashed.push(`${kind}:${message}`) }
    }),
    commitSession: vi.fn(async (session: { flashed: string[] }) => `flash=${session.flashed.join('|')}`),
  }
})

const { okWithToast, redirectWithToast } = await import('./_toast.server')

const request = new Request('https://unitae.example.test/settings/general', { method: 'POST' })

describe('redirectWithToast', () => {
  it('goes back to the page with the message to show', async () => {
    const response = await redirectWithToast(request, '/settings/general', 'Saved')
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/settings/general')
    expect(response.headers.get('Set-Cookie')).toBe('flash=success:Saved')
  })

  it('shows a refusal as an error', async () => {
    const response = await redirectWithToast(request, '/settings/data', 'Not an archive', 'error')
    expect(response.headers.get('Set-Cookie')).toBe('flash=error:Not an archive')
  })
})

describe('okWithToast', () => {
  it('closes the dialog and shows the message', async () => {
    const result = await okWithToast(request, 'Saved')
    expect(result.data).toEqual({ ok: true })
    expect(new Headers(result.init?.headers).get('Set-Cookie')).toBe('flash=success:Saved')
  })
})
