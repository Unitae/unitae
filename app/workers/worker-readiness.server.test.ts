import { describe, expect, it } from 'vitest'
import { createWorkerReadiness, registerWithRetry, workerHealthStatus } from './worker-readiness.server'

describe('createWorkerReadiness', () => {
  it('is ready only once every worker and every scheduler is up', () => {
    const readiness = createWorkerReadiness({ workers: ['email', 'retention'], schedulers: ['retention-daily'] })

    readiness.workerReady('email')
    readiness.workerReady('retention')
    expect(readiness.isReady()).toBe(false)

    readiness.schedulerRegistered('retention-daily')
    expect(readiness.isReady()).toBe(true)
  })

  // A worker whose daily sweeps are not scheduled must not look healthy: retention anonymises
  // departed members, and a silent registration failure would stop it with nobody noticing.
  it('stays not ready while a scheduler is missing, even with every worker up', () => {
    const readiness = createWorkerReadiness({ workers: ['retention'], schedulers: ['retention-daily', 'campaign'] })

    readiness.workerReady('retention')
    readiness.schedulerRegistered('retention-daily')

    expect(readiness.isReady()).toBe(false)
  })

  it('ignores names it was not told to expect', () => {
    const readiness = createWorkerReadiness({ workers: ['email'], schedulers: [] })

    readiness.workerReady('unknown')
    expect(readiness.isReady()).toBe(false)

    readiness.workerReady('email')
    expect(readiness.isReady()).toBe(true)
  })
})

describe('registerWithRetry', () => {
  it('retries a failing registration with growing delays until it succeeds', async () => {
    const waits: number[] = []
    const failures: number[] = []
    let calls = 0

    await registerWithRetry(
      () => {
        calls++
        return calls < 4 ? Promise.reject(new Error('redis unavailable')) : Promise.resolve()
      },
      {
        delaysMs: [100, 200, 400],
        sleep: ms => {
          waits.push(ms)
          return Promise.resolve()
        },
        onFailure: (_error, attempt) => {
          failures.push(attempt)
        },
      },
    )

    expect(calls).toBe(4)
    expect(waits).toEqual([100, 200, 400])
    expect(failures).toEqual([1, 2, 3])
  })

  it('keeps retrying at the last delay once the schedule is exhausted', async () => {
    const waits: number[] = []
    let calls = 0

    await registerWithRetry(
      () => {
        calls++
        return calls < 5 ? Promise.reject(new Error('redis unavailable')) : Promise.resolve()
      },
      {
        delaysMs: [10, 20],
        sleep: ms => {
          waits.push(ms)
          return Promise.resolve()
        },
        onFailure: () => {},
      },
    )

    expect(waits).toEqual([10, 20, 20, 20])
  })

  it('stops retrying once told to stop, without resolving as registered', async () => {
    let stopped = false
    let calls = 0

    const registered = await registerWithRetry(
      () => {
        calls++
        return Promise.reject(new Error('redis unavailable'))
      },
      {
        delaysMs: [10],
        sleep: () => {
          stopped = true
          return Promise.resolve()
        },
        onFailure: () => {},
        shouldStop: () => stopped,
      },
    )

    expect(registered).toBe(false)
    expect(calls).toBe(1)
  })

  it('reports success when the first attempt works', async () => {
    const registered = await registerWithRetry(() => Promise.resolve(), {
      delaysMs: [10],
      sleep: () => Promise.resolve(),
      onFailure: () => {},
    })

    expect(registered).toBe(true)
  })
})

describe('workerHealthStatus', () => {
  const up = { ready: true, closing: false }

  it('answers readiness (/health and /) from workers and schedulers', () => {
    expect(workerHealthStatus('/health', up)).toBe(200)
    expect(workerHealthStatus('/', up)).toBe(200)
    expect(workerHealthStatus('/health', { ready: false, closing: false })).toBe(503)
  })

  // A scheduler that keeps failing to register must take the worker out of readiness, but must
  // not make the liveness probe kill it: the queues still process email, sync and thumbnails.
  it('keeps /livez at 200 while a scheduler keeps failing to register', () => {
    const schedulerFailing = { ready: false, closing: false }

    expect(workerHealthStatus('/health', schedulerFailing)).toBe(503)
    expect(workerHealthStatus('/livez', schedulerFailing)).toBe(200)
  })

  it('reports 503 on every endpoint while shutting down', () => {
    const closing = { ready: true, closing: true }

    expect(workerHealthStatus('/health', closing)).toBe(503)
    expect(workerHealthStatus('/livez', closing)).toBe(503)
  })

  it('ignores the query string', () => {
    expect(workerHealthStatus('/livez?probe=1', { ready: false, closing: false })).toBe(200)
  })
})
