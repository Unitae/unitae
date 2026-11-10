import { describe, expect, it } from 'vitest'
import { freshFetcherData } from './fresh-fetcher-data'

const created = { created: { id: 7, number: 'C042' } }
const refused = { formError: 'Limite atteinte' }

describe('freshFetcherData', () => {
  it('has nothing while the fetcher is not idle', () => {
    expect(freshFetcherData('submitting', created, null)).toBeNull()
    expect(freshFetcherData('loading', created, null)).toBeNull()
  })

  it('has nothing when idle but no answer has arrived yet', () => {
    expect(freshFetcherData('idle', undefined, null)).toBeNull()
  })

  it('gives an answer the first time it sees it, whatever it says', () => {
    expect(freshFetcherData('idle', created, null)).toBe(created)
    expect(freshFetcherData('idle', refused, null)).toBe(refused)
  })

  it('gives the same answer only once, so a re-render does not act twice', () => {
    expect(freshFetcherData('idle', created, created)).toBeNull()
    expect(freshFetcherData('idle', refused, refused)).toBeNull()
  })

  it('gives a new answer again: react-router mints a new object for each submission', () => {
    const second = { created: { id: 8, number: 'C043' } }
    expect(freshFetcherData('idle', second, created)).toBe(second)
  })

  it('catches an answer whose submitting state was never observed', () => {
    // On fast local responses react-router batches submitting → idle into one render: watching the state transition
    // would miss it, the identity check does not.
    expect(freshFetcherData('idle', created, null)).toBe(created)
  })

  it('never takes "no answer" for one', () => {
    expect(freshFetcherData('idle', undefined, created)).toBeNull()
  })
})
