export interface ShareViaDeviceDeps {
  /** navigator.share, or undefined where the browser has no share sheet. */
  share?: (data: { text: string }) => Promise<void>
  copy: (text: string) => Promise<void>
  onCopied: () => void
  onFailed: () => void
}

// Chrome and Safari reject a share the user did not actually ask for, and the
// same errors surface when they simply close the sheet. Neither is a failure
// worth interrupting them about.
function isDismissal(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'NotAllowedError')
}

/**
 * Hands the finished message to the phone's share sheet, falling back to the
 * clipboard where there isn't one.
 *
 * `share` is invoked before this function yields. navigator.share requires
 * transient user activation, and any `await` ahead of it spends that
 * activation — Safari then refuses with NotAllowedError. Callers must not
 * await anything between the click and this call for the same reason.
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
