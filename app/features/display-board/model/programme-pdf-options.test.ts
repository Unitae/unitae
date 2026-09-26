import { describe, expect, it } from 'vitest'
import { programmePdfOptions } from './programme-pdf-options'

describe('programmePdfOptions', () => {
  it('uses the per-template parts and services choices of a configured programme', () => {
    const options = programmePdfOptions({
      events: [{ templateId: 1 }, { templateId: 2 }],
      showServices: true,
      config: {
        templates: [
          { templateId: 1, parts: true, services: false },
          { templateId: 2, parts: false, services: true },
        ],
        groupBy: 'template',
      },
    })

    expect(options.groupBy).toBe('template')
    expect(options.configMap.get(1)).toEqual({ parts: true, services: false })
    expect(options.configMap.get(2)).toEqual({ parts: false, services: true })
  })

  it('hides services on a legacy programme whose board document hides them', () => {
    // Legacy documents have no config; without an entry the sheet would default to printing
    // services the board does not show.
    const options = programmePdfOptions({
      events: [{ templateId: 7 }, { templateId: 7 }],
      showServices: false,
      config: null,
    })

    expect(options.groupBy).toBe('date')
    expect(options.configMap.get(7)).toEqual({ parts: true, services: false })
  })

  it('shows services on a legacy programme whose board document shows them', () => {
    const options = programmePdfOptions({ events: [{ templateId: 7 }], showServices: true, config: null })

    expect(options.configMap.get(7)).toEqual({ parts: true, services: true })
  })

  it('ignores events without a template', () => {
    const options = programmePdfOptions({ events: [{ templateId: null }], showServices: false, config: null })

    expect(options.configMap.size).toBe(0)
  })
})
