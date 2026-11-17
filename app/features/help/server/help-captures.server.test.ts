import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HELP_LOCALES } from '~/features/help/model/help.type'
import { helpImagesIn } from '~/features/help/model/help-captures'
import { HELP_CAPTURES } from '~/features/help/server/help-captures.server'
import { loadHelpArticles } from '~/features/help/server/help-content.server'

// The captures as shipped: what the manifest lists is on disk, in both themes, and every capture is shown somewhere.
const PUBLIC_ROOT = resolve(import.meta.dirname, '../../../../public')
const CAPTURE_SCHEME = 'capture:'

describe('the shipped help captures', () => {
  for (const locale of HELP_LOCALES) {
    it(`has both themes of every ${locale} capture on disk`, () => {
      for (const id of Object.keys(HELP_CAPTURES[locale])) {
        expect(existsSync(resolve(PUBLIC_ROOT, 'help-captures', locale, `${id}.webp`)), `${locale}/${id}`).toBe(true)
        expect(existsSync(resolve(PUBLIC_ROOT, 'help-captures', locale, `${id}.dark.webp`)), `${locale}/${id}`).toBe(
          true,
        )
      }
    })

    it(`shows every ${locale} capture in an article: none ships unused`, () => {
      const shown = new Set(
        loadHelpArticles()
          .filter(article => article.locale === locale)
          .flatMap(article => helpImagesIn(article.body).map(({ src }) => src.slice(CAPTURE_SCHEME.length))),
      )

      expect(Object.keys(HELP_CAPTURES[locale]).filter(id => !shown.has(id))).toEqual([])
    })
  }
})
