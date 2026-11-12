import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TrialBannerInfo } from '~/shared/domain/trial-status'

import { TrialBanner } from './TrialBanner'

/** An HTML tag, to read the rendered words alone. */
const TAG = /<[^>]+>/g

const render = (trial: TrialBannerInfo | null) => renderToStaticMarkup(createElement(TrialBanner, { trial }))

const IN_TRIAL: TrialBannerInfo = { daysLeft: 12, endingSoon: false, endsOn: '30 octobre', subscribeUrl: null }

describe('TrialBanner', () => {
  it('renders nothing outside a trial', () => {
    expect(render(null)).toBe('')
  })

  it('gives the days left and the last day', () => {
    const html = render(IN_TRIAL)
    expect(html).toContain('12')
    expect(html).toContain('30 octobre')
  })

  it('offers the subscription link only when there is one', () => {
    expect(render(IN_TRIAL)).not.toContain('<a ')
    expect(render({ ...IN_TRIAL, subscribeUrl: 'https://billing.example/checkout' })).toContain(
      'href="https://billing.example/checkout"',
    )
  })

  it('says it is the last day rather than "1 days"', () => {
    // The words only: the status icon's SVG path has numbers of its own.
    const text = render({ ...IN_TRIAL, daysLeft: 1, endingSoon: true }).replace(TAG, ' ')
    expect(text).not.toContain(' 1 ')
    expect(text).toContain('Dernier jour')
  })
})
