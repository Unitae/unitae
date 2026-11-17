import { HELP_ISSUES_URL } from '~/features/help/model/help-links'
import * as m from '~/i18n/paraglide/messages'

/**
 * The way out of the help, for everyone: the public issue tracker. Help never points at the website: billing
 * questions go there through the support page, which is not this app's business.
 */
export function HelpFallback() {
  return (
    <p className="border-border border-t pt-4 text-muted-foreground text-sm">
      <a
        href={HELP_ISSUES_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-text underline underline-offset-2"
      >
        {m.help_fallback_question()}
      </a>
      <span className="mt-1 block text-faint text-xs">{m.help_fallback_privacy()}</span>
    </p>
  )
}
