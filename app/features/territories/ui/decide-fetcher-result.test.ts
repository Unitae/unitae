import { describe, expect, it } from 'vitest'
import type { SplitToolCreateActionResult } from '~/features/territories/routes/split-tool/create'
import { decideFetcherResult } from './decide-fetcher-result'

const success: SplitToolCreateActionResult = { ok: true, number: 'C042', territoryId: 7 }
const failure: SplitToolCreateActionResult = { ok: false, error: 'Limite atteinte' }

describe('decideFetcherResult', () => {
  it('returns "skip" while the fetcher is not idle', () => {
    expect(decideFetcherResult('submitting', success, null)).toEqual({ action: 'skip' })
    expect(decideFetcherResult('loading', success, null)).toEqual({ action: 'skip' })
  })

  it('returns "skip" when idle but no data has arrived yet', () => {
    expect(decideFetcherResult('idle', undefined, null)).toEqual({ action: 'skip' })
  })

  it('returns "success" the first time it sees a fresh ok:true payload', () => {
    expect(decideFetcherResult('idle', success, null)).toEqual({ action: 'success', data: success })
  })

  it('returns "error" the first time it sees a fresh ok:false payload', () => {
    expect(decideFetcherResult('idle', failure, null)).toEqual({ action: 'error', error: 'Limite atteinte' })
  })

  it('is idempotent — returns "skip" when the same payload is processed twice', () => {
    // Guards against re-firing the toast + reset on every re-render after success.
    expect(decideFetcherResult('idle', success, success)).toEqual({ action: 'skip' })
    expect(decideFetcherResult('idle', failure, failure)).toEqual({ action: 'skip' })
  })

  it('fires again when a NEW payload arrives (different object identity)', () => {
    // Second create submission after a first one; react-router mints a fresh data object.
    const secondSuccess: SplitToolCreateActionResult = { ok: true, number: 'C043', territoryId: 8 }
    expect(decideFetcherResult('idle', secondSuccess, success)).toEqual({ action: 'success', data: secondSuccess })
  })

  it('detects the batched-transition case that the previous state-transition impl missed', () => {
    // Regression case: on fast local responses, react-router batches state so the effect never
    // observes 'submitting' — prev=idle, next=idle, but a fresh data reference DID arrive.
    // The identity check catches it; the old prev-state-based impl would have returned "skip".
    expect(decideFetcherResult('idle', success, null)).toEqual({ action: 'success', data: success })
  })

  it('never treats "no data" as a spurious success', () => {
    // Defensive: passing undefined data at any state should skip, not throw.
    expect(decideFetcherResult('idle', undefined, success)).toEqual({ action: 'skip' })
  })
})
