import { useCallback, useEffect, useState } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

const CONSENT_KEY = 'unitae_map_consent'

export function useMapConsent() {
  const [consented, setConsented] = useState(false)

  useEffect(() => {
    setConsented(localStorage.getItem(CONSENT_KEY) === 'true')
  }, [])

  const grantConsent = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, 'true')
    setConsented(true)
  }, [])

  return { consented, grantConsent }
}

export default function MapConsentBanner({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-lg border border-border bg-subtle p-6 text-center">
      <p className="mb-2 font-medium">{m.map_consent_title()}</p>
      <p className="mb-4 max-w-sm text-muted-foreground text-sm">{m.map_consent_description()}</p>
      <Button type="button" size="sm" onClick={onAccept}>
        {m.map_consent_accept()}
      </Button>
    </div>
  )
}
