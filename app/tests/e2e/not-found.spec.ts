import { expect, test } from '@playwright/test'

test.describe('Unknown path', () => {
  // Regression: when no route matched, no middleware ran, so the 404 page left without the
  // security headers every other response carries.
  test('answers 404 with the security headers', async ({ request }) => {
    const response = await request.get('/this-path-does-not-exist')

    expect(response.status()).toBe(404)
    expect(response.headers()['x-frame-options']).toBe('DENY')
    expect(response.headers()['x-content-type-options']).toBe('nosniff')
    expect(response.headers()['content-security-policy-report-only']).toContain("default-src 'self'")
  })

  test('still renders the not-found page', async ({ page }) => {
    const response = await page.goto('/this-path-does-not-exist')

    expect(response?.status()).toBe(404)
    await expect(page.getByText('404')).toBeVisible()
  })
})
