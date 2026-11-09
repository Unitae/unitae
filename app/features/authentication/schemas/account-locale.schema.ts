import { z } from 'zod'
import { locales } from '~/i18n/paraglide/runtime'

// The choice that clears the account's own locale, so it follows its congregation's again.
export const FOLLOW_CONGREGATION = 'congregation'

export const accountLocaleSchema = z.object({
  locale: z.enum([FOLLOW_CONGREGATION, ...locales]),
})
