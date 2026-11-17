import { HELP_MODULES, type HelpArticle, type HelpLocale, type HelpModule } from '~/features/help/model/help.type'
import { Permission } from '~/shared/types/permission'

/** Raised when an article file breaks the format. The tests run it over every shipped article, so it never ships. */
export class HelpArticleFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HelpArticleFormatError'
  }
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/
const LINE_BREAK = /\r?\n/

const REQUIRED_KEYS = ['slug', 'title', 'summary', 'module', 'permission', 'order'] as const
const KNOWN_KEYS: readonly string[] = [...REQUIRED_KEYS, 'keywords', 'related']

/**
 * Reads one article file: a frontmatter block of `key: value` lines between two `---` lines, then the Markdown body.
 * Values are taken whole, after the first colon. Lists (`keywords`, `related`) are comma-separated and may be empty.
 * The permission is the name of a `Permission` member, several of them comma-separated (any one opens the article),
 * or `none`. A key may appear once, and only the known keys.
 */
export function parseHelpArticle(source: string, locale: HelpLocale): HelpArticle {
  const { fields, body } = splitFrontmatter(source)

  for (const key of REQUIRED_KEYS) {
    if (!fields.has(key) || fields.get(key) === '') {
      throw new HelpArticleFormatError(`Help article is missing « ${key} ».`)
    }
  }

  const slug = fields.get('slug') ?? ''
  if (!SLUG_PATTERN.test(slug)) throw new HelpArticleFormatError(`Help article slug « ${slug} » is not valid.`)

  const module = fields.get('module') ?? ''
  if (!isHelpModule(module)) throw new HelpArticleFormatError(`Help article « ${slug} » has an unknown module.`)

  const permission = readPermission(fields.get('permission') ?? '', slug)

  const order = Number(fields.get('order'))
  if (!Number.isInteger(order))
    throw new HelpArticleFormatError(`Help article « ${slug} » has an order that is not a whole number.`)

  return {
    slug,
    locale,
    title: fields.get('title') ?? '',
    summary: fields.get('summary') ?? '',
    module,
    permission,
    keywords: readList(fields.get('keywords')),
    related: readList(fields.get('related')),
    order,
    body,
  }
}

function splitFrontmatter(source: string): { fields: Map<string, string>; body: string } {
  const match = FRONTMATTER_PATTERN.exec(source)
  if (!match) throw new HelpArticleFormatError('Help article has no frontmatter block.')

  const fields = new Map<string, string>()
  for (const line of match[1].split(LINE_BREAK)) {
    if (line.trim() === '') continue
    const separator = line.indexOf(':')
    if (separator === -1) throw new HelpArticleFormatError(`Help article frontmatter line has no colon: « ${line} ».`)
    const key = line.slice(0, separator).trim()
    if (!KNOWN_KEYS.includes(key))
      throw new HelpArticleFormatError(`Help article frontmatter has an unknown key « ${key} ».`)
    if (fields.has(key)) throw new HelpArticleFormatError(`Help article frontmatter repeated the key « ${key} ».`)
    fields.set(key, line.slice(separator + 1).trim())
  }

  return { fields, body: match[2].trim() }
}

function readList(value: string | undefined): string[] {
  if (value == null) return []
  return value
    .split(',')
    .map(item => item.trim())
    .filter(item => item !== '')
}

function readPermission(value: string, slug: string): HelpArticle['permission'] {
  if (value === 'none') return null
  const names = readList(value)
  for (const name of names) {
    if (!Object.keys(Permission).includes(name)) {
      throw new HelpArticleFormatError(`Help article « ${slug} » names an unknown permission « ${name} ».`)
    }
  }
  if (new Set(names).size !== names.length) {
    throw new HelpArticleFormatError(`Help article « ${slug} » lists a permission twice.`)
  }
  return names as (keyof typeof Permission)[]
}

function isHelpModule(value: string): value is HelpModule {
  return (HELP_MODULES as readonly string[]).includes(value)
}
