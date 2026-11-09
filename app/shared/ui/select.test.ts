import { createElement as h, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

// What the server sends: the value's label has to be in it, or the field reads blank until hydration.
function serverRender(props: { value?: string; defaultValue?: string }, items: ReactNode, placeholder?: string) {
  return renderToString(
    h(
      Select,
      { ...props, name: 'section' },
      h(SelectTrigger, null, h(SelectValue, { placeholder })),
      h(SelectContent, null, items),
    ),
  )
}

const options = [
  h(SelectItem, { key: 'a', value: 'a' }, 'Assemblée'),
  h(SelectItem, { key: 'b', value: 'b' }, 'Anciens'),
]

describe('Select before hydration', () => {
  it('shows the label of its default value', () => {
    expect(serverRender({ defaultValue: 'b' }, options)).toContain('Anciens')
  })

  it('shows the label of a controlled value', () => {
    expect(serverRender({ value: 'a' }, options)).toContain('Assemblée')
  })

  it('finds an item inside a group', () => {
    expect(serverRender({ defaultValue: 'b' }, h(SelectGroup, null, options))).toContain('Anciens')
  })

  it('shows the placeholder while nothing is chosen', () => {
    const html = serverRender({}, options, 'Choisir une section')

    expect(html).toContain('Choisir une section')
    expect(html).not.toContain('Anciens')
  })
})
