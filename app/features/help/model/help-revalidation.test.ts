import type { ShouldRevalidateFunctionArgs } from 'react-router'
import { describe, expect, it } from 'vitest'
import { skipRevalidationForHelpPanel } from '~/features/help/model/help-revalidation'

function args(current: string, next: string, extra: Partial<ShouldRevalidateFunctionArgs> = {}) {
  return {
    currentUrl: new URL(current, 'https://unitae.test'),
    nextUrl: new URL(next, 'https://unitae.test'),
    currentParams: {},
    nextParams: {},
    defaultShouldRevalidate: true,
    ...extra,
  } satisfies ShouldRevalidateFunctionArgs
}

// The « ? » panel only changes `?help=`: the page behind it keeps its data, and only the article is fetched.
describe('skipRevalidationForHelpPanel', () => {
  it('keeps the page data when the panel opens', () => {
    expect(skipRevalidationForHelpPanel(args('/me/days-off', '/me/days-off?help=absences'))).toBe(false)
  })

  it('keeps the page data when the panel closes', () => {
    expect(skipRevalidationForHelpPanel(args('/territories?q=12&help=create-territory', '/territories?q=12'))).toBe(
      false,
    )
  })

  it('keeps the page data when a related link swaps the article in the panel', () => {
    expect(skipRevalidationForHelpPanel(args('/board?help=board-read', '/board?help=board-download'))).toBe(false)
  })

  it('reloads when another parameter changes with the panel', () => {
    expect(skipRevalidationForHelpPanel(args('/territories?q=12', '/territories?q=13&help=create-territory'))).toBe(
      true,
    )
  })

  it('reloads when the page itself changes', () => {
    expect(skipRevalidationForHelpPanel(args('/board?help=board-read', '/help/board-read'))).toBe(true)
  })

  it('reloads after a form is sent, even when only the panel differs', () => {
    expect(
      skipRevalidationForHelpPanel(args('/me/days-off', '/me/days-off?help=absences', { formMethod: 'POST' })),
    ).toBe(true)
  })

  it('reloads after an action on the same address, where the panel did not change', () => {
    expect(skipRevalidationForHelpPanel(args('/me/days-off?help=absences', '/me/days-off?help=absences'))).toBe(true)
  })

  it('follows the default when it already says not to reload', () => {
    expect(
      skipRevalidationForHelpPanel(args('/territories?q=12', '/territories?q=13', { defaultShouldRevalidate: false })),
    ).toBe(false)
  })
})
