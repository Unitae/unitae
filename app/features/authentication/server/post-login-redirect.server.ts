import logger from '~/shared/infra/logger.server'
import { safeRedirectUrl } from '~/shared/utils/safe-redirect.server'

export function resolvePostLoginRedirect(request: Request, formData: FormData): string {
  const formValue = formData.get('redirectTo')
  if (formValue != null && typeof formValue !== 'string') {
    logger.debug(`resolvePostLoginRedirect: ignoring non-string redirectTo form value (${typeof formValue})`)
  }
  const fromForm = typeof formValue === 'string' && formValue.length > 0 ? formValue : null

  let fromUrl: string | null = null
  try {
    fromUrl = new URL(request.url).searchParams.get('redirectTo')
  } catch {
    logger.warn(`resolvePostLoginRedirect: unable to parse request.url (${request.url})`)
  }

  return safeRedirectUrl(fromForm ?? fromUrl, '/')
}

export function buildLoginRedirectUrl(target: string): string {
  return target === '/' ? '/login' : `/login?redirectTo=${encodeURIComponent(target)}`
}
