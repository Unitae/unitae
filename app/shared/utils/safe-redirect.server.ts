import logger from '~/shared/infra/logger.server'

/**
 * Validates that a redirect URL is a safe relative path.
 * Prevents open redirect attacks via attacker-controlled URLs (e.g., Referer header).
 * Logs a warning when a non-empty url is rejected — useful for spotting phishing probes.
 */
export function safeRedirectUrl(url: string | null, fallback: string): string {
  if (url?.startsWith('/') && !url.startsWith('//')) return url
  if (url != null && url.length > 0) {
    logger.warn(`safeRedirectUrl: rejected potentially unsafe redirect target (${url})`)
  }
  return fallback
}
