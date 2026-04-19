import { expect, test } from '@playwright/test'

test.describe('Health check', () => {
  test('retourne 200 quand les services sont disponibles', async ({ request }) => {
    const response = await request.get('/health')
    expect(response.ok()).toBeTruthy()
  })
})
