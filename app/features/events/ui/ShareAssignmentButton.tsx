import { Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { shareViaDevice } from '~/features/events/model/share-via-device'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

type ShareAssignmentButtonProps = {
  /** Finished message, built server-side. See build-share-message.server.ts. */
  text: string
  label: string
}

/**
 * Opens the phone's share sheet with the message already written.
 *
 * The handler is deliberately not async and does not await before calling
 * shareViaDevice: navigator.share needs the user's transient activation, and
 * any await ahead of it spends that activation. That is also why the message
 * arrives as a prop rather than being fetched when the button is pressed.
 *
 * The branching itself lives in model/share-via-device.ts so it can be tested
 * without a browser.
 */
export function ShareAssignmentButton({ text, label }: ShareAssignmentButtonProps) {
  function handleShare() {
    shareViaDevice(text, {
      share: typeof navigator !== 'undefined' && navigator.share ? data => navigator.share(data) : undefined,
      copy: value => navigator.clipboard.writeText(value),
      onCopied: () => toast.success(m.programs_share_copied()),
      onFailed: () => toast.error(m.programs_share_failed()),
    })
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7"
      onClick={handleShare}
      aria-label={label}
      title={label}
    >
      <Share2 className="size-3" />
    </Button>
  )
}
