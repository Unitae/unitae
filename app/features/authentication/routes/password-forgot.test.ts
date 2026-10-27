import { beforeEach, describe, expect, it, vi } from 'vitest'

// The real reset service and rate-limit guard run against in-memory Redis counters, so the tests
// observe which bucket a request was counted in and what the page tells the user.
const { counters, flashes, redisState } = vi.hoisted(() => ({
  counters: new Map<string, number>(),
  flashes: [] as { kind: string; message: string }[],
  redisState: { down: false },
}))

vi.mock('~/shared/infra/redis.server', () => ({
  redisRateLimit: {
    eval: vi.fn((_script: string, _keys: number, key: string) => {
      if (redisState.down) return Promise.reject(new Error('connection refused'))
      const count = (counters.get(key) ?? 0) + 1
      counters.set(key, count)
      return Promise.resolve(count)
    }),
  },
}))

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { userAccount: { findFirst: vi.fn(() => Promise.resolve(null)) } },
}))

vi.mock('~/features/authentication/server/session.server', () => ({
  getSession: vi.fn(() =>
    Promise.resolve({
      flash: (kind: string, message: string) => {
        flashes.push({ kind, message })
      },
    }),
  ),
  commitSession: vi.fn(() => Promise.resolve('__session=committed')),
}))

const { action } = await import('./password-forgot')
const m = await import('~/i18n/paraglide/messages')

function forgot(email: string, clientIp?: string) {
  return action({
    request: new Request('https://unitae.example.test/password/forgot', {
      method: 'POST',
      headers: clientIp ? { 'x-unitae-client-ip': clientIp } : {},
      body: new URLSearchParams({ email }),
    }),
    params: {},
    context: {},
  } as Parameters<typeof action>[0])
}

beforeEach(() => {
  counters.clear()
  flashes.length = 0
  redisState.down = false
})

describe('password-forgot action', () => {
  it('counts the request against the client address the server resolved', async () => {
    await forgot('someone@example.com', '203.0.113.77')

    expect(counters.get('password_reset:window:ip:203.0.113.77')).toBe(1)
  })

  it('shows the usual message once an address is rate-limited, so nothing is revealed', async () => {
    for (let i = 0; i < 4; i++) await forgot('someone@example.com', '203.0.113.77')

    expect(flashes.at(-1)).toEqual({ kind: 'success', message: m.auth_password_forgot_success_message() })
  })

  it('says the service is unavailable instead of claiming an email was sent', async () => {
    redisState.down = true

    await forgot('someone@example.com', '203.0.113.77')

    expect(flashes).toEqual([{ kind: 'error', message: m.auth_password_forgot_unavailable_error() }])
  })
})
