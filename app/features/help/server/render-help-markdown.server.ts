import MarkdownIt from 'markdown-it'

const EXTERNAL_LINK = /^https?:\/\//i

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

/**
 * Renders an article body to HTML. Raw HTML in the source is escaped, never passed through (`html: false`), and
 * markdown-it's own link check refuses `javascript:` and similar addresses. External links open in a new tab without
 * giving the new page a handle back to the app; links inside the app stay in the same tab.
 */
export function renderHelpMarkdown(body: string): string {
  return markdown.render(body)
}
