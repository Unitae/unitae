import { WifiOff } from 'lucide-react'

import * as m from '~/i18n/paraglide/messages'
import { useOnlineStatus } from '~/shared/ui/hooks/use-online-status'

export function OfflineBanner() {
  const isOnline = useOnlineStatus()

  if (isOnline) return null

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-amber-800 text-sm dark:bg-amber-900/50 dark:text-amber-200">
      <WifiOff className="size-4 shrink-0" />
      <span>{m.common_offline_message()}</span>
    </div>
  )
}
