/**
 * Validates that a redirect URL is a safe relative path.
 * Prevents open redirect attacks via attacker-controlled URLs (e.g., Referer header).
 */
export function safeRedirectUrl(url: string | null, fallback: string): string {
  if (url && url.startsWith('/') && !url.startsWith('//')) return url
  return fallback
}
