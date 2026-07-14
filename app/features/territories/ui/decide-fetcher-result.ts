import type { SplitToolCreateActionResult } from '~/features/territories/routes/split-tool/create'

export type FetcherLifecycle = 'idle' | 'submitting' | 'loading'

export type FetcherResultDecision =
  | { action: 'skip' }
  | { action: 'success'; data: Extract<SplitToolCreateActionResult, { ok: true }> }
  | { action: 'error'; error: string }

/**
 * Decides whether a fetcher's current (state, data) pair represents a fresh submission
 * response that the effect should react to. Dedups by object identity — react-router
 * returns a new `data` reference for each submission response, and the last-processed
 * reference is kept in a caller-owned ref.
 *
 * The identity check is deliberate — an earlier implementation watched the
 * `submitting → idle` state transition instead and silently dropped the reset
 * whenever react-router batched both transitions into one render cycle (fast local
 * responses, e.g. devtools closed). Regression case is covered in the tests.
 */
export function decideFetcherResult(
  state: FetcherLifecycle,
  data: SplitToolCreateActionResult | undefined,
  previouslyProcessed: SplitToolCreateActionResult | null,
): FetcherResultDecision {
  if (state !== 'idle') return { action: 'skip' }
  if (data == null) return { action: 'skip' }
  if (data === previouslyProcessed) return { action: 'skip' }

  if (data.ok) return { action: 'success', data }
  return { action: 'error', error: data.error }
}
