import { overwriteGetLocale } from '~/i18n/paraglide/runtime'
import { DEFAULT_LOCALE } from '~/shared/utils/language'

// Tests run outside any request, where Paraglide would fall back to its base locale, English. The
// app falls back to DEFAULT_LOCALE instead (shared/utils/locale-scope.server.ts), so tests start
// from it too. A suite that loads locale-scope.server replaces this override with the real one,
// which answers DEFAULT_LOCALE outside runWithLocale: the outcome is the same.
overwriteGetLocale(() => DEFAULT_LOCALE)
