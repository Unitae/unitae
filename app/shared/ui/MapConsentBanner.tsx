import { useCallback, useEffect, useState } from 'react'
import * as m from '~/i18n/paraglide/messages'

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
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
      <p className="mb-2 font-medium text-gray-900">{m.map_consent_title()}</p>
      <p className="mb-4 max-w-sm text-gray-600 text-sm">{m.map_consent_description()}</p>
      <button
        type="button"
        onClick={onAccept}
        className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700"
      >
        {m.map_consent_accept()}
      </button>
    </div>
  )
}
