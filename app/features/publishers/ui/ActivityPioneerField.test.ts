import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

import { ActivityPioneerField } from './ActivityPioneerField'

function render(props: Partial<Parameters<typeof ActivityPioneerField>[0]>) {
  return renderToStaticMarkup(
    createElement(ActivityPioneerField, {
      enrolment: null,
      options: [PublisherType.Normal, PublisherType.PionnierAuxiliaires],
      value: PublisherType.Normal,
      onChange: () => undefined,
      ...props,
    }),
  )
}

describe('ActivityPioneerField', () => {
  // Regression: an enrolled month showed the enrolment goal and still asked for the service.
  it('states an enrolled month and its goal instead of asking', () => {
    const html = render({ enrolment: { type: PublisherType.PionnierAuxiliaires, goal: 30 } })

    expect(html).not.toContain('id="type"')
    expect(html).toContain('30 h')
    // The edit schema requires `type`, so the locked value still has to be submitted.
    expect(html).toContain(`<input type="hidden" name="type" value="${PublisherType.PionnierAuxiliaires}"/>`)
  })

  it('asks for the service when no enrolment covers the month', () => {
    expect(render({})).toContain('id="type"')
  })

  it('says saving aligns a report recorded with another type', () => {
    const enrolment = { type: PublisherType.PionnierAuxiliaires, goal: 30 }

    const differs = render({ enrolment, recordedType: PublisherType.Normal })
    const same = render({ enrolment, recordedType: PublisherType.PionnierAuxiliaires })

    expect(differs).toContain('aligné')
    expect(same).not.toContain('aligné')
  })
})
