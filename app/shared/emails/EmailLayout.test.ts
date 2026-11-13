import { hexColors } from '@unitae/tokens'
import { createElement, type FunctionComponent } from 'react'
import { render } from 'react-email'
import { describe, expect, it } from 'vitest'

// Every template, as `pnpm start:emails` finds them: a new one is checked the day it is added.
const templates = import.meta.glob<{ default: FunctionComponent }>('../../features/*/emails/*.tsx', { eager: true })

const PRE_REBRAND = /teal|#eaeaea|#666666|text-blue/i

describe('the e-mail templates', () => {
  it('are all found', () => {
    expect(Object.keys(templates).length).toBeGreaterThanOrEqual(11)
  })

  for (const [path, template] of Object.entries(templates)) {
    it(`${path.split('/features/')[1]} wears the brand`, async () => {
      // Each template carries sample props as defaults, for the preview server.
      const html = await render(createElement(template.default))

      // The card, and the mark's petrol dot.
      expect(html).toContain(hexColors.light.surface)
      expect(html).toContain(hexColors.light.accent)
      expect(html).not.toMatch(PRE_REBRAND)
    })
  }
})
