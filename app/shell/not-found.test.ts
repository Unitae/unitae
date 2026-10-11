import { describe, expect, it } from 'vitest'

import { action, loader } from './not-found'

describe('not-found route', () => {
  it.each([
    ['loader', loader],
    ['action', action],
  ])('answers 404 from its %s', (_name, handler) => {
    let thrown: unknown
    try {
      handler()
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Response)
    expect((thrown as Response).status).toBe(404)
  })
})
