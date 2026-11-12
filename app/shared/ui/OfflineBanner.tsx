import { Callout } from '@unitae/ui'

import * as m from '~/i18n/paraglide/messages'
import { useOnlineStatus } from '~/shared/ui/hooks/use-online-status'

/** A strip over the page while the device is offline. */
export function OfflineBanner() {
  const isOnline = useOnlineStatus()

  if (isOnline) return null

  return <Callout tone="warning" role="status" title={m.common_offline_message()} className={STRIP} />
}

/** A `Callout` across the top of the page rather than a box inside it. */
export const STRIP = 'rounded-none border-0 px-4 py-2 md:px-6'
