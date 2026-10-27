// Readiness of the background worker process: every queue worker has connected AND every daily
// scheduler (retention, campaign lifecycle) is registered. A worker whose schedulers failed to
// register still processes jobs, but its daily sweeps never run; reporting it healthy would hide
// that, and retention is what anonymises departed members.

interface ReadinessExpectations {
  workers: readonly string[]
  schedulers: readonly string[]
}

export function createWorkerReadiness({ workers, schedulers }: ReadinessExpectations) {
  const readyWorkers = new Set<string>()
  const registeredSchedulers = new Set<string>()

  return {
    workerReady(name: string) {
      if (workers.includes(name)) readyWorkers.add(name)
    },
    schedulerRegistered(name: string) {
      if (schedulers.includes(name)) registeredSchedulers.add(name)
    },
    isReady() {
      return readyWorkers.size === workers.length && registeredSchedulers.size === schedulers.length
    },
  }
}

interface RetryOptions {
  // Delay before each retry; the last one repeats once the list is exhausted.
  delaysMs: readonly number[]
  sleep: (ms: number) => Promise<void>
  onFailure: (error: unknown, attempt: number) => void
  shouldStop?: () => boolean
}

export const SCHEDULER_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000] as const

// Retries a registration until it succeeds. Resolves true once registered, false if stopped first
// (shutdown), so a transient Redis outage at boot delays the schedulers instead of losing them.
export async function registerWithRetry(register: () => Promise<unknown>, options: RetryOptions): Promise<boolean> {
  for (let attempt = 1; ; attempt++) {
    try {
      await register()
      return true
    } catch (error) {
      options.onFailure(error, attempt)
      const delay = options.delaysMs[Math.min(attempt - 1, options.delaysMs.length - 1)] ?? 0
      await options.sleep(delay)
      if (options.shouldStop?.()) return false
    }
  }
}
