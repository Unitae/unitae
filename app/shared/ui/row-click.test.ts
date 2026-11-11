import { describe, expect, it } from 'vitest'
import { rowPrimaryFor } from './row-click'

// A row opens its item wherever it is clicked, by handing the click to its primary control. Clicks on a control of
// their own, clicks from a portal, and text being selected are not the row's to handle.

interface FakeElement {
  name: string
  parent: FakeElement | null
  control?: boolean
  primary?: boolean
}

const el = (name: string, parent: FakeElement | null, extra: Partial<FakeElement> = {}): FakeElement => ({
  name,
  parent,
  ...extra,
})

function domOf(nodes: FakeElement[]) {
  const ancestors = (node: FakeElement | null) => {
    const chain: FakeElement[] = []
    for (let current = node; current; current = current.parent) chain.push(current)
    return chain
  }
  const wrap = (node: FakeElement): unknown => ({
    node,
    closest: () => {
      const found = ancestors(node).find(each => each.control)
      return found ? wrap(found) : null
    },
  })
  return {
    wrap,
    row: (row: FakeElement) => ({
      contains: (other: { node: FakeElement } | null) => other != null && ancestors(other.node).includes(row),
      querySelector: () => {
        const found = nodes.find(each => each.primary && ancestors(each).includes(row))
        return found ? wrap(found) : null
      },
    }),
  }
}

const row = el('tr', null)
const nameCell = el('td', row)
const link = el('a', nameCell, { control: true, primary: true })
const linkText = el('span', link)
const statusCell = el('td', row)
const statusText = el('span', statusCell)
const checkbox = el('button', el('td', row), { control: true })
const elsewhere = el('div', null)
const dom = domOf([row, nameCell, link, linkText, statusCell, statusText, checkbox, elsewhere])

const click = (target: FakeElement, over: { defaultPrevented?: boolean } = {}) => ({
  currentTarget: dom.row(row) as never,
  target: dom.wrap(target) as never,
  defaultPrevented: over.defaultPrevented ?? false,
})

describe('rowPrimaryFor', () => {
  it('hands a click anywhere on the row to its primary control', () => {
    expect((rowPrimaryFor(click(statusText), true) as unknown as { node: FakeElement })?.node).toBe(link)
    expect((rowPrimaryFor(click(statusCell), true) as unknown as { node: FakeElement })?.node).toBe(link)
  })

  it('leaves a click on a control to that control — the primary link itself included', () => {
    expect(rowPrimaryFor(click(linkText), true)).toBeNull()
    expect(rowPrimaryFor(click(checkbox), true)).toBeNull()
  })

  it('ignores a click from a portal, which bubbles through the row in React but is not in it', () => {
    expect(rowPrimaryFor(click(elsewhere), true)).toBeNull()
  })

  it('does not open while text is being selected, nor when something already handled the click', () => {
    expect(rowPrimaryFor(click(statusText), false)).toBeNull()
    expect(rowPrimaryFor(click(statusText, { defaultPrevented: true }), true)).toBeNull()
  })
})
