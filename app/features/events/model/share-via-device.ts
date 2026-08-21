export interface ShareViaDeviceDeps {
  /** navigator.share, or undefined where the browser has no share sheet. */
  share?: (data: { text: string }) => Promise<void>
  copy: (text: string) => Promise<void>
  onCopied: () => void
  onFailed: () => void
}

// Closing the share sheet surfaces as AbortError, and Safari reports a share it
// considers unrequested as NotAllowedError. Neither is worth interrupting the
// user about.
//
// Matched by shape rather than `instanceof DOMException`: the constructor is
// per-realm, so an error thrown inside an iframe fails the instanceof check
// while being the very same condition.
function isDismissal(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('name' in error)) return false
  const { name } = error as { name: unknown }
  return name === 'AbortError' || name === 'NotAllowedError'
}

/**
 * Hands the finished message to the phone's share sheet, falling back to the
 * clipboard where there isn't one.
 *
 * `share` is called synchronously, before this function reaches its first
 * `await`. navigator.share requires transient user activation, and any `await`
 * ahead of the call spends it — Safari then refuses with NotAllowedError. For
 * the same reason callers must not await anything between the click and this
 * call.
 *
 * Only `text` is passed. Setting `url` makes WhatsApp collapse the share to a
 * link preview and drop the message body, and `title` is appended
 * inconsistently on Android.
 */
export async function shareViaDevice(text: string, deps: ShareViaDeviceDeps): Promise<void> {
  if (deps.share) {
    try {
      await deps.share({ text })
    } catch (error) {
      if (!isDismissal(error)) deps.onFailed()
    }
    return
  }

  try {
    await deps.copy(text)
    deps.onCopied()
  } catch {
    deps.onFailed()
  }
}
