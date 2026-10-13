import { expect, test } from '@playwright/test'

test.describe('Health check', () => {
  test('the server responds to requests', async ({ request }) => {
    const response = await request.get('/')
    // We just verify the server is running and responds
    expect(response.status()).toBeLessThan(500)
  })

  test('the liveness endpoint answers', async ({ request }) => {
    const response = await request.get('/livez')
    expect(response.status()).toBe(200)
    expect(await response.text()).toBe('ok')
  })
})
