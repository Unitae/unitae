import { expect, test } from '@playwright/test'

test.describe('Health check', () => {
  test('the server responds to requests', async ({ request }) => {
    const response = await request.get('/')
    // We just verify the server is running and responds
    expect(response.status()).toBeLessThan(500)
  })
})
