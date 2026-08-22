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
 * Only `text` is passed, for two separate reasons.
 *
 * Safari has a long-standing bug where supplying `text` and `url` together
 * shares only the url and silently drops the text. Reported against WhatsApp
 * and Messenger since iOS 14 and still reported on iOS 16; the same code works
 * on Android. Since the recipients here are on phones, and the message is the
 * whole point, folding the link into `text` is the only way to be sure it
 * survives. See https://developer.apple.com/forums/thread/662629
 *
 * `title` is omitted because MDN documents it as "May be ignored by the
 * target" — not something to depend on either way.
 * https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
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
