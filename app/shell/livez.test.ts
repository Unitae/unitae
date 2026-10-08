import { describe, expect, it } from 'vitest'

import { loader } from './livez'

describe('livez loader', () => {
  it('answers 200 ok without a cacheable body', async () => {
    const response = loader()

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
