import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { HydratedRouter } from 'react-router/dom'

import { defineCustomClientStrategy, isLocale } from '~/paraglide/runtime'

defineCustomClientStrategy('custom-congregation', {
  getLocale: () => {
    const lang = document.documentElement.lang
    if (isLocale(lang)) return lang
    return undefined
  },
  setLocale: (_newLocale: string) => {
    // Locale is server-driven (congregation setting), no client-side persistence needed
  },
})

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  )
})
