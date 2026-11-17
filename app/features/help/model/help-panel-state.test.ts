import { describe, expect, it } from 'vitest'
import type { HelpArticleView } from '~/features/help/model/help.type'
import { helpPanelState } from '~/features/help/model/help-panel-state'

const FOUND: HelpArticleView = {
  kind: 'found',
  slug: 'absences',
  title: 'Comment indiquer mes absences ?',
  summary: 'Une période.',
  module: 'absences',
  html: '<p>Texte</p>',
  related: [],
}

describe('helpPanelState', () => {
  it('shows the loading state while the request is in flight, even over an article for this slug', () => {
    expect(helpPanelState('absences', FOUND, 'loading')).toEqual({ kind: 'loading' })
  })

  it('never shows a stale article under a new slug', () => {
    expect(helpPanelState('bano', FOUND, 'idle')).toEqual({ kind: 'loading' })
  })

  it('shows the loading state before any data has arrived', () => {
    expect(helpPanelState('absences', undefined, 'idle')).toEqual({ kind: 'loading' })
  })

  it('shows the error state inside the panel when the article could not be loaded', () => {
    expect(helpPanelState('absences', { kind: 'error', slug: 'absences' }, 'idle')).toEqual({ kind: 'error' })
  })

  it('shows the article once it is the one asked for', () => {
    expect(helpPanelState('absences', FOUND, 'idle')).toEqual({ kind: 'ready', view: FOUND })
  })

  it('shows the answer for a forbidden or missing article as ready, since the page explains it', () => {
    const forbidden: HelpArticleView = { kind: 'forbidden', slug: 'absences' }

    expect(helpPanelState('absences', forbidden, 'idle')).toEqual({ kind: 'ready', view: forbidden })
  })
})
