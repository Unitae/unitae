import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/logger.server', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const { exitAfterDrain } = await import('./graceful-exit.server')

describe('exitAfterDrain', () => {
  let exit: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
  })

  afterEach(() => {
    exit.mockRestore()
    vi.useRealTimers()
  })

  // Regression: open database and Redis connections kept a stopped server alive until the
  // process manager killed it.
  it('lets requests in flight finish, then exits', () => {
    exitAfterDrain('SIGTERM', 10_000)

    vi.advanceTimersByTime(9_999)
    expect(exit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(exit).toHaveBeenCalledWith(0)
  })
})
