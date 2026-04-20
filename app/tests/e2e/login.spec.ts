import { expect, test } from '@playwright/test'

test.describe('Authentication', () => {
  test('server responds to page requests', async ({ page }) => {
    const response = await page.goto('/login')
    expect(response?.status()).toBeLessThan(500)
  })

  test('server responds to protected routes', async ({ page }) => {
    const response = await page.goto('/publishers')
    // Server should respond without crashing
    expect(response?.status()).toBeLessThan(500)
  })
})
