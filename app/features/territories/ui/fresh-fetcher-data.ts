export type FetcherLifecycle = 'idle' | 'submitting' | 'loading'

/**
 * The fetcher's answer when it is a new one to act on, else `null`. Dedups by object identity: react-router returns a
 * new `data` object for each submission's answer, and the caller keeps the last one it acted on in a ref.
 *
 * The identity check is deliberate: watching the `submitting → idle` transition instead silently missed answers
 * whenever react-router batched both transitions into one render (fast local responses).
 */
export function freshFetcherData<T>(
  state: FetcherLifecycle,
  data: T | undefined,
  previouslyActedOn: T | null,
): T | null {
  if (state !== 'idle' || data == null || data === previouslyActedOn) return null
  return data
}
