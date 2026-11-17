import MarkdownIt from 'markdown-it'
import type { HelpLocale } from '~/features/help/model/help.type'
import { HELP_CAPTURE_SCHEME, type HelpCapture, helpCaptureUrl } from '~/features/help/model/help-captures'
import * as m from '~/i18n/paraglide/messages'

const EXTERNAL_LINK = /^https?:\/\//i

// A type, not an interface: markdown-it's env is an open record, which an interface does not satisfy.
type RenderEnv = {
  locale: HelpLocale
  captures: Record<string, HelpCapture>
}

const NO_CAPTURES: RenderEnv = { locale: 'fr', captures: {} }

const ENLARGE_CLASSES =
  'block max-w-full cursor-zoom-in rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false })

const defaultLinkOpen =
  markdown.renderer.rules.link_open ??
  ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options))

markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const href = String(tokens[index].attrGet('href') ?? '')
  if (EXTERNAL_LINK.test(href)) {
    tokens[index].attrSet('target', '_blank')
    tokens[index].attrSet('rel', 'noopener noreferrer')
  }
  return defaultLinkOpen(tokens, index, options, env, self)
}

// Only the app's captures are drawn, in both themes: the class on <html> shows one and hides the other, and a hidden
// lazy image is never fetched. Any other source draws nothing.
markdown.renderer.rules.image = (tokens, index, _options, env) => {
  const { locale, captures } = (env ?? NO_CAPTURES) as RenderEnv
  const token = tokens[index]
  const src = String(token.attrGet('src') ?? '')
  const id = src.startsWith(HELP_CAPTURE_SCHEME) ? src.slice(HELP_CAPTURE_SCHEME.length) : null
  const capture = id == null ? undefined : captures[id]
  if (id == null || capture == null) return ''

  const alt = markdown.utils.escapeHtml(token.content)
  const label = markdown.utils.escapeHtml(m.help_capture_enlarge({ alt: token.content }, { locale }))
  const image = (theme: 'light' | 'dark', className: string) =>
    `<img src="${helpCaptureUrl(locale, id, theme, capture.captured)}" alt="${alt}" width="${capture.width}" height="${capture.height}" loading="lazy" decoding="async" class="${className}">`
  // A button, so the capture opens at full size from a tap or the keyboard: HelpArticleBody listens for it.
  return `<button type="button" data-help-capture aria-label="${label}" class="${ENLARGE_CLASSES}">${image('light', 'dark:hidden')}${image('dark', 'hidden dark:block')}</button>`
}

/**
 * Renders an article body to HTML. Raw HTML in the source is escaped, never passed through (`html: false`), and
 * markdown-it's own link check refuses `javascript:` and similar addresses. External links open in a new tab without
 * giving the new page a handle back to the app; links inside the app stay in the same tab. Images draw the captures
 * of the article's language, `![what it shows](capture:<id>)`, and nothing else.
 */
export function renderHelpMarkdown(body: string, env: RenderEnv = NO_CAPTURES): string {
  return markdown.render(body, env)
}
