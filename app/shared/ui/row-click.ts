import type { MouseEvent as ReactMouseEvent } from 'react'

// A table row opens its item wherever it is clicked, as its primary control does — the link or the button marked
// `data-row-primary`. The row hands the click to that control, so a link still navigates and a button still opens its
// panel; the control stays the one thing keyboards and screen readers reach.
//
// Not a stretched link (`after:absolute after:inset-0` under a `relative` row): WebKit never makes a `<tr>` the
// containing block of an absolute child, so in Safari, and every browser on iOS, each row's overlay covered the whole
// page and the last row's won — every click opened the last item of the list.

const CONTROLS = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[contenteditable="true"]',
].join(', ')

interface RowClick {
  currentTarget: Pick<HTMLElement, 'contains' | 'querySelector'>
  target: EventTarget | null
  defaultPrevented: boolean
}

/** The control a click on a row should be handed to, or null when the click is not the row's to handle. */
export function rowPrimaryFor(click: RowClick, selectionCollapsed: boolean): HTMLElement | null {
  const row = click.currentTarget
  const target = click.target as Element | null
  if (click.defaultPrevented || target == null || typeof target.closest !== 'function') return null
  // A click from a portal — a menu, a dialog opened from the row — bubbles through the row in React, not in the page.
  if (!row.contains(target)) return null
  // A control of its own, the primary one included, does what it does.
  const control = target.closest(CONTROLS)
  if (control != null && row.contains(control)) return null
  // Selecting text in a row is not opening it.
  if (!selectionCollapsed) return null
  return row.querySelector<HTMLElement>('[data-row-primary]')
}

/** `onClick` for a `<tr>` that opens its item wherever it is clicked. Mark the row's link or button `data-row-primary`. */
export function openRowOnClick(event: ReactMouseEvent<HTMLElement>): void {
  const primary = rowPrimaryFor(event, window.getSelection()?.isCollapsed ?? true)
  if (primary == null) return
  // ⌘- or Ctrl-click opens a link in a new tab, as on the link itself: browsers ignore the keys of a click a script
  // hands over, so the tab is opened here, within the person's own click.
  if ((event.metaKey || event.ctrlKey || event.shiftKey) && primary instanceof HTMLAnchorElement && primary.href) {
    window.open(primary.href, '_blank', 'noopener')
    return
  }
  primary.click()
}

/**
 * A row's main action (« Saisir ») where there is a mouse: hidden until the row is hovered or something in it has
 * keyboard focus. On a touch screen it is always there, and the button is 44 px. The row carries `group`.
 */
export const ROW_ACTION_REVEAL =
  'transition-opacity duration-(--u-duration-fast) focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100'
