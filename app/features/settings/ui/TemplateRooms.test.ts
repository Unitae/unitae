import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { TemplateRooms } from './TemplateRooms'

// The first render of « Salles »: each room with its use, the main room never offered for deletion, the add field.
const render = (rooms: Parameters<typeof TemplateRooms>[0]['rooms']) => {
  const router = createMemoryRouter([{ path: '/', element: h(TemplateRooms, { rooms }) }])
  return renderToString(h(RouterProvider, { router }))
}

describe('TemplateRooms, first render', () => {
  it('reads the unnamed main room « Salle principale » for everyone, another by its name and its parts', () => {
    const markup = render([
      { id: 50, name: null, isMain: true, partCount: 12 },
      { id: 51, name: 'Salle B', isMain: false, partCount: 3 },
    ])
    expect(markup).toContain('Salle principale')
    expect(markup).toContain('toute l’assemblée')
    expect(markup).toContain('Salle B')
    expect(markup).toContain('3 parties')
    expect(markup).toContain('aria-label="Actions de la salle Salle B"')
    expect(markup).toContain('name="intent" value="add-room"')
  })

  it('counts one part in the singular', () => {
    expect(render([{ id: 51, name: 'Salle B', isMain: false, partCount: 1 }])).toContain('1 partie<')
  })
})
